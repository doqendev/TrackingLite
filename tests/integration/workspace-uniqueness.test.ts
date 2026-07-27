import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { cleanDatabase, disconnectAll } from "./helpers/db";
import {
  createSubscription,
  createUser,
  createWorkspace,
} from "./helpers/factories";
import { makeRequest } from "./helpers/request";

// Mock auth for protected routes
const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({
  auth: () => mockAuth(),
}));

// Mock the Shopify domain resolver to avoid external HTTP calls
vi.mock("@/lib/shopify-domain-resolver", () => ({
  resolveShopifyDomain: vi.fn(),
}));

import { POST } from "@/app/api/workspaces/route";
import { PATCH } from "@/app/api/workspaces/[id]/route";
import { db } from "@/lib/db";
import { resolveShopifyDomain } from "@/lib/shopify-domain-resolver";

const mockResolveShopifyDomain = vi.mocked(resolveShopifyDomain);

const SHOPIFY_RESULT = {
  shopifyDomain: "test-store.myshopify.com",
  displayDomain: "test.com",
};

describe("Workspace Shopify Domain Uniqueness", () => {
  let user: any;

  beforeEach(async () => {
    await cleanDatabase();
    mockAuth.mockReset();
    mockResolveShopifyDomain.mockReset();
    user = await createUser();
    await createSubscription(user.id, { plan: "STARTER" });
    mockAuth.mockResolvedValue({ user: { id: user.id } });
  });

  afterAll(async () => {
    await disconnectAll();
  });

  // === POST: duplicate shopifyDomain ===

  describe("POST /api/workspaces — duplicate shopifyDomain", () => {
    it("returns 409 when creating a second workspace with the same shopifyDomain", async () => {
      // First workspace: resolver returns Shopify result
      mockResolveShopifyDomain.mockResolvedValue(SHOPIFY_RESULT);

      const first = makeRequest("/api/workspaces", {
        method: "POST",
        body: { name: "Store One", domain: "test.com" },
      });
      const firstResponse = await POST(first);
      expect(firstResponse.status).toBe(201);

      // Verify shopifyDomain stored in DB
      const firstData = await firstResponse.json();
      const dbRecord = await db.workspace.findUnique({ where: { id: firstData.id } });
      expect(dbRecord?.shopifyDomain).toBe("test-store.myshopify.com");

      // Second workspace: same shopifyDomain resolves again
      mockResolveShopifyDomain.mockResolvedValue(SHOPIFY_RESULT);

      const second = makeRequest("/api/workspaces", {
        method: "POST",
        body: { name: "Store Two", domain: "test.com" },
      });
      const secondResponse = await POST(second);
      const secondData = await secondResponse.json();

      expect(secondResponse.status).toBe(409);
      expect(secondData.code).toBe("DOMAIN_TAKEN");
    });

    it("returns 409 even when submitted by a different user", async () => {
      // First user creates a workspace
      mockResolveShopifyDomain.mockResolvedValue(SHOPIFY_RESULT);
      const firstRequest = makeRequest("/api/workspaces", {
        method: "POST",
        body: { name: "Store One", domain: "test.com" },
      });
      const firstResponse = await POST(firstRequest);
      expect(firstResponse.status).toBe(201);

      // Switch to a different user
      const otherUser = await createUser({ email: "other@example.com" });
      mockAuth.mockResolvedValue({ user: { id: otherUser.id } });
      mockResolveShopifyDomain.mockResolvedValue(SHOPIFY_RESULT);

      const secondRequest = makeRequest("/api/workspaces", {
        method: "POST",
        body: { name: "Duplicate Store", domain: "test.com" },
      });
      const secondResponse = await POST(secondRequest);
      const secondData = await secondResponse.json();

      expect(secondResponse.status).toBe(409);
      expect(secondData.code).toBe("DOMAIN_TAKEN");
    });
  });

  // === POST: different shopifyDomains both succeed ===

  describe("POST /api/workspaces — different shopifyDomains", () => {
    it("allows creating workspaces with different shopifyDomains", async () => {
      // First workspace
      mockResolveShopifyDomain.mockResolvedValueOnce({
        shopifyDomain: "store-a.myshopify.com",
        displayDomain: "store-a.com",
      });
      const firstRequest = makeRequest("/api/workspaces", {
        method: "POST",
        body: { name: "Store A", domain: "store-a.com" },
      });
      const firstResponse = await POST(firstRequest);
      expect(firstResponse.status).toBe(201);

      // Second workspace with a different Shopify domain
      mockResolveShopifyDomain.mockResolvedValueOnce({
        shopifyDomain: "store-b.myshopify.com",
        displayDomain: "store-b.com",
      });
      const secondRequest = makeRequest("/api/workspaces", {
        method: "POST",
        body: { name: "Store B", domain: "store-b.com" },
      });
      const secondResponse = await POST(secondRequest);
      expect(secondResponse.status).toBe(201);

      // Both should exist in DB
      const workspaces = await db.workspace.findMany({
        where: { userId: user.id, isActive: true },
      });
      expect(workspaces).toHaveLength(2);
      const domains = workspaces.map((w) => w.shopifyDomain).sort();
      expect(domains).toEqual(["store-a.myshopify.com", "store-b.myshopify.com"]);
    });
  });

  // === POST: null shopifyDomain (non-Shopify) ===

  describe("POST /api/workspaces — null shopifyDomain (non-Shopify)", () => {
    it("allows multiple workspaces with null shopifyDomain (no conflict)", async () => {
      // Resolver returns null — not a Shopify store
      mockResolveShopifyDomain.mockResolvedValue(null);

      const firstRequest = makeRequest("/api/workspaces", {
        method: "POST",
        body: { name: "Non-Shopify Store 1", domain: "example.com" },
      });
      const firstResponse = await POST(firstRequest);
      expect(firstResponse.status).toBe(201);

      mockResolveShopifyDomain.mockResolvedValue(null);

      const secondRequest = makeRequest("/api/workspaces", {
        method: "POST",
        body: { name: "Non-Shopify Store 2", domain: "another-example.com" },
      });
      const secondResponse = await POST(secondRequest);
      expect(secondResponse.status).toBe(201);

      // Both should exist with null shopifyDomain
      const workspaces = await db.workspace.findMany({
        where: { userId: user.id, isActive: true },
      });
      expect(workspaces).toHaveLength(2);
      expect(workspaces.every((w) => w.shopifyDomain === null)).toBe(true);
    });

    it("allows two workspaces with the same non-Shopify domain (no uniqueness check)", async () => {
      mockResolveShopifyDomain.mockResolvedValue(null);

      const firstRequest = makeRequest("/api/workspaces", {
        method: "POST",
        body: { name: "WooCommerce Store 1", domain: "woocommerce-store.com" },
      });
      const firstResponse = await POST(firstRequest);
      expect(firstResponse.status).toBe(201);

      mockResolveShopifyDomain.mockResolvedValue(null);

      const secondRequest = makeRequest("/api/workspaces", {
        method: "POST",
        body: { name: "WooCommerce Store 2", domain: "woocommerce-store.com" },
      });
      const secondResponse = await POST(secondRequest);
      expect(secondResponse.status).toBe(201);
    });
  });

  // === PATCH: update domain to a taken shopifyDomain ===

  describe("PATCH /api/workspaces/[id] — domain update uniqueness", () => {
    it("returns 409 when updating a workspace domain to one already taken", async () => {
      // Create workspace A with shopifyDomain "store-a.myshopify.com"
      mockResolveShopifyDomain.mockResolvedValueOnce({
        shopifyDomain: "store-a.myshopify.com",
        displayDomain: "store-a.com",
      });
      const wsARequest = makeRequest("/api/workspaces", {
        method: "POST",
        body: { name: "Store A", domain: "store-a.com" },
      });
      const wsAResponse = await POST(wsARequest);
      expect(wsAResponse.status).toBe(201);

      // Create workspace B with shopifyDomain "store-b.myshopify.com"
      mockResolveShopifyDomain.mockResolvedValueOnce({
        shopifyDomain: "store-b.myshopify.com",
        displayDomain: "store-b.com",
      });
      const wsBRequest = makeRequest("/api/workspaces", {
        method: "POST",
        body: { name: "Store B", domain: "store-b.com" },
      });
      const wsBResponse = await POST(wsBRequest);
      expect(wsBResponse.status).toBe(201);
      const wsBData = await wsBResponse.json();

      // Now PATCH workspace B, trying to claim store-a.myshopify.com
      mockResolveShopifyDomain.mockResolvedValueOnce({
        shopifyDomain: "store-a.myshopify.com",
        displayDomain: "store-a.com",
      });
      const patchRequest = makeRequest(`/api/workspaces/${wsBData.id}`, {
        method: "PATCH",
        body: { domain: "store-a.com" },
      });
      const patchResponse = await PATCH(patchRequest, {
        params: Promise.resolve({ id: wsBData.id }),
      });
      const patchData = await patchResponse.json();

      expect(patchResponse.status).toBe(409);
      expect(patchData.code).toBe("DOMAIN_TAKEN");
    });

    it("allows updating a workspace to its own existing shopifyDomain (no self-conflict)", async () => {
      // Create workspace with a shopifyDomain
      mockResolveShopifyDomain.mockResolvedValueOnce(SHOPIFY_RESULT);
      const createRequest = makeRequest("/api/workspaces", {
        method: "POST",
        body: { name: "My Store", domain: "test.com" },
      });
      const createResponse = await POST(createRequest);
      expect(createResponse.status).toBe(201);
      const created = await createResponse.json();

      // PATCH the same workspace with the same domain — resolver returns the same shopifyDomain
      mockResolveShopifyDomain.mockResolvedValueOnce(SHOPIFY_RESULT);
      const patchRequest = makeRequest(`/api/workspaces/${created.id}`, {
        method: "PATCH",
        body: { domain: "test.com" },
      });
      const patchResponse = await PATCH(patchRequest, {
        params: Promise.resolve({ id: created.id }),
      });

      expect(patchResponse.status).toBe(200);
    });

    it("allows updating to a non-Shopify domain (resolver returns null)", async () => {
      // Create workspace initially with a Shopify domain
      mockResolveShopifyDomain.mockResolvedValueOnce(SHOPIFY_RESULT);
      const createRequest = makeRequest("/api/workspaces", {
        method: "POST",
        body: { name: "My Store", domain: "test.com" },
      });
      const createResponse = await POST(createRequest);
      expect(createResponse.status).toBe(201);
      const created = await createResponse.json();

      // PATCH to a non-Shopify domain — resolver returns null
      mockResolveShopifyDomain.mockResolvedValueOnce(null);
      const patchRequest = makeRequest(`/api/workspaces/${created.id}`, {
        method: "PATCH",
        body: { domain: "some-woocommerce-store.com" },
      });
      const patchResponse = await PATCH(patchRequest, {
        params: Promise.resolve({ id: created.id }),
      });

      expect(patchResponse.status).toBe(200);

      // shopifyDomain should be cleared
      const dbRecord = await db.workspace.findUnique({ where: { id: created.id } });
      expect(dbRecord?.shopifyDomain).toBeNull();
    });

    it("does not conflict with a soft-deleted workspace's shopifyDomain", async () => {
      // Create and then soft-delete a workspace with the target shopifyDomain
      const existingWs = await createWorkspace(user.id, { name: "Old Store" });
      await db.workspace.update({
        where: { id: existingWs.id },
        data: { shopifyDomain: "test-store.myshopify.com", isActive: false },
      });

      // Create a new workspace with a different domain first
      mockResolveShopifyDomain.mockResolvedValueOnce({
        shopifyDomain: "other-store.myshopify.com",
        displayDomain: "other.com",
      });
      const createRequest = makeRequest("/api/workspaces", {
        method: "POST",
        body: { name: "New Store", domain: "other.com" },
      });
      const createResponse = await POST(createRequest);
      expect(createResponse.status).toBe(201);
      const newWs = await createResponse.json();

      // PATCH the new workspace to claim the soft-deleted workspace's shopifyDomain — should succeed
      mockResolveShopifyDomain.mockResolvedValueOnce(SHOPIFY_RESULT);
      const patchRequest = makeRequest(`/api/workspaces/${newWs.id}`, {
        method: "PATCH",
        body: { domain: "test.com" },
      });
      const patchResponse = await PATCH(patchRequest, {
        params: Promise.resolve({ id: newWs.id }),
      });

      expect(patchResponse.status).toBe(200);
    });
  });
});
