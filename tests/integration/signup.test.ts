import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

vi.mock("@/lib/email", () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
}));

import { POST } from "@/app/api/auth/signup/route";
import { makeRequest } from "./helpers/request";
import {
  cleanDatabase,
  cleanRedis,
  disconnectAll,
} from "./helpers/db";
import { db } from "@/lib/db";

describe("POST /api/auth/signup", () => {
  beforeEach(async () => {
    await cleanDatabase();
    await cleanRedis();
  });

  afterAll(async () => {
    await disconnectAll();
  });

  it("creates a user with valid data", async () => {
    const request = makeRequest("/api/auth/signup", {
      method: "POST",
      body: {
        name: "John Doe",
        email: "john@example.com",
        password: "Password123",
      },
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.email).toBe("john@example.com");
    expect(data.name).toBe("John Doe");
    expect(data.id).toBeDefined();

    // Verify user exists in DB with hashed password
    const user = await db.user.findUnique({ where: { email: "john@example.com" } });
    expect(user).toBeTruthy();
    expect(user!.hashedPassword).toBeDefined();
    expect(user!.hashedPassword).not.toBe("Password123");
  });

  it("returns 422 for missing name", async () => {
    const request = makeRequest("/api/auth/signup", {
      method: "POST",
      body: { email: "john@example.com", password: "password123" },
    });

    const response = await POST(request);
    expect(response.status).toBe(422);
  });

  it("returns 422 for short password", async () => {
    const request = makeRequest("/api/auth/signup", {
      method: "POST",
      body: { name: "John", email: "john@example.com", password: "short" },
    });

    const response = await POST(request);
    expect(response.status).toBe(422);
  });

  it("returns 409 for duplicate email", async () => {
    const body = {
      name: "John",
      email: "john@example.com",
      password: "Password123",
    };

    await POST(makeRequest("/api/auth/signup", { method: "POST", body }));

    const response = await POST(
      makeRequest("/api/auth/signup", { method: "POST", body })
    );
    expect(response.status).toBe(409);
  });

  it("returns 422 for invalid email", async () => {
    const request = makeRequest("/api/auth/signup", {
      method: "POST",
      body: { name: "John", email: "not-an-email", password: "Password123" },
    });

    const response = await POST(request);
    expect(response.status).toBe(422);
  });
});
