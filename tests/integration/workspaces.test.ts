import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { cleanDatabase, disconnectAll } from "./helpers/db";
import { createUser, createWorkspace } from "./helpers/factories";
import { makeRequest } from "./helpers/request";

// Mock auth for protected routes
const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({
  auth: () => mockAuth(),
}));

vi.mock("@/lib/shopify-domain-resolver", () => ({
  resolveShopifyDomain: vi.fn().mockResolvedValue(null),
}));

import { GET, POST } from "@/app/api/workspaces/route";
import {
  GET as GET_BY_ID,
  PATCH,
  DELETE,
} from "@/app/api/workspaces/[id]/route";
import { POST as ROTATE_KEY } from "@/app/api/workspaces/[id]/rotate-key/route";
import { db } from "@/lib/db";

describe("Workspace API", () => {
  let user: any;

  beforeEach(async () => {
    await cleanDatabase();
    mockAuth.mockReset();
    user = await createUser();
    mockAuth.mockResolvedValue({ user: { id: user.id } });
  });

  afterAll(async () => {
    await disconnectAll();
  });

  // === GET /api/workspaces ===

  describe("GET /api/workspaces", () => {
    it("returns 401 when unauthenticated", async () => {
      mockAuth.mockResolvedValue(null);

      const response = await GET();
      expect(response.status).toBe(401);
    });

    it("returns empty array for user with no workspaces", async () => {
      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual([]);
    });

    it("returns user workspaces", async () => {
      await createWorkspace(user.id, { name: "Store 1" });
      await createWorkspace(user.id, { name: "Store 2" });

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toHaveLength(2);
    });

    it("does not return other user workspaces", async () => {
      const otherUser = await createUser({ email: "other@example.com" });
      await createWorkspace(otherUser.id, { name: "Other Store" });
      await createWorkspace(user.id, { name: "My Store" });

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toHaveLength(1);
      expect(data[0].name).toBe("My Store");
    });
  });

  // === POST /api/workspaces ===

  describe("POST /api/workspaces", () => {
    it("creates a workspace with valid data", async () => {
      const request = makeRequest("/api/workspaces", {
        method: "POST",
        body: { name: "My Store", domain: "my-store.myshopify.com" },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.name).toBe("My Store");
      expect(data.apiKey).toBeDefined();
      expect(data.apiKey).toMatch(/^tl_/);

      // Verify in DB
      const ws = await db.workspace.findUnique({ where: { id: data.id } });
      expect(ws).toBeTruthy();
      expect(ws!.userId).toBe(user.id);
    });

    it("creates workspace with Meta credentials (encrypted)", async () => {
      const request = makeRequest("/api/workspaces", {
        method: "POST",
        body: {
          name: "Meta Store",
          domain: "meta-store.myshopify.com",
          metaPixelId: "123456",
          metaAccessToken: "EAAtest123",
        },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.metaPixelId).toBe("123456");
      expect(data.metaAccessTokenEncrypted).toBeDefined();
      expect(data.metaAccessTokenEncrypted).not.toBe("EAAtest123");
    });

    it("returns 422 for invalid payload", async () => {
      const request = makeRequest("/api/workspaces", {
        method: "POST",
        body: { name: "" },
      });

      const response = await POST(request);
      expect(response.status).toBe(422);
    });
  });

  // === GET /api/workspaces/[id] ===

  describe("GET /api/workspaces/[id]", () => {
    it("returns own workspace", async () => {
      const ws = await createWorkspace(user.id);
      const request = makeRequest(`/api/workspaces/${ws.id}`);

      const response = await GET_BY_ID(request, {
        params: Promise.resolve({ id: ws.id }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.id).toBe(ws.id);
      expect(data.hasMetaAccessToken).toBe(true);
      // Should NOT expose the encrypted token directly
      expect(data.metaAccessTokenEncrypted).toBeUndefined();
    });

    it("returns 404 for other user workspace", async () => {
      const otherUser = await createUser({ email: "other2@example.com" });
      const otherWs = await createWorkspace(otherUser.id);
      const request = makeRequest(`/api/workspaces/${otherWs.id}`);

      const response = await GET_BY_ID(request, {
        params: Promise.resolve({ id: otherWs.id }),
      });

      expect(response.status).toBe(404);
    });
  });

  // === PATCH /api/workspaces/[id] ===

  describe("PATCH /api/workspaces/[id]", () => {
    it("updates workspace name", async () => {
      const ws = await createWorkspace(user.id);
      const request = makeRequest(`/api/workspaces/${ws.id}`, {
        method: "PATCH",
        body: { name: "Updated Name" },
      });

      const response = await PATCH(request, {
        params: Promise.resolve({ id: ws.id }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.name).toBe("Updated Name");
    });

    it("updates Meta token with new encryption", async () => {
      const ws = await createWorkspace(user.id);
      const request = makeRequest(`/api/workspaces/${ws.id}`, {
        method: "PATCH",
        body: { metaAccessToken: "EAAnewtoken456" },
      });

      const response = await PATCH(request, {
        params: Promise.resolve({ id: ws.id }),
      });

      expect(response.status).toBe(200);

      // Verify in DB that token changed
      const updated = await db.workspace.findUnique({
        where: { id: ws.id },
      });
      expect(updated!.metaAccessTokenEncrypted).not.toBe(
        ws.metaAccessTokenEncrypted
      );
    });

    it("returns 404 for other user workspace", async () => {
      const otherUser = await createUser({ email: "other3@example.com" });
      const otherWs = await createWorkspace(otherUser.id);

      const request = makeRequest(`/api/workspaces/${otherWs.id}`, {
        method: "PATCH",
        body: { name: "Hacked" },
      });

      const response = await PATCH(request, {
        params: Promise.resolve({ id: otherWs.id }),
      });

      expect(response.status).toBe(404);
    });
  });

  // === DELETE /api/workspaces/[id] ===

  describe("DELETE /api/workspaces/[id]", () => {
    it("soft deletes own workspace", async () => {
      const ws = await createWorkspace(user.id);
      const request = makeRequest(`/api/workspaces/${ws.id}`, {
        method: "DELETE",
      });

      const response = await DELETE(request, {
        params: Promise.resolve({ id: ws.id }),
      });

      expect(response.status).toBe(200);

      const deleted = await db.workspace.findUnique({
        where: { id: ws.id },
      });
      expect(deleted!.isActive).toBe(false);
    });
  });

  // === POST /api/workspaces/[id]/rotate-key ===

  describe("POST /api/workspaces/[id]/rotate-key", () => {
    it("rotates API key for own workspace", async () => {
      const ws = await createWorkspace(user.id);
      const oldKey = ws.apiKey;

      const request = makeRequest(
        `/api/workspaces/${ws.id}/rotate-key`,
        { method: "POST" }
      );

      const response = await ROTATE_KEY(request, {
        params: Promise.resolve({ id: ws.id }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.apiKey).toBeDefined();
      expect(data.apiKey).not.toBe(oldKey);
      expect(data.apiKey).toMatch(/^tl_/);
    });

    it("returns 404 for other user workspace", async () => {
      const otherUser = await createUser({ email: "other4@example.com" });
      const otherWs = await createWorkspace(otherUser.id);

      const request = makeRequest(
        `/api/workspaces/${otherWs.id}/rotate-key`,
        { method: "POST" }
      );

      const response = await ROTATE_KEY(request, {
        params: Promise.resolve({ id: otherWs.id }),
      });

      expect(response.status).toBe(404);
    });
  });
});
