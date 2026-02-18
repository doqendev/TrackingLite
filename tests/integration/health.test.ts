import { describe, it, expect, vi, afterAll } from "vitest";
import { GET } from "@/app/api/health/route";
import { disconnectAll } from "./helpers/db";

describe("GET /api/health", () => {
  afterAll(async () => {
    await disconnectAll();
  });

  it("returns 200 with database connected", async () => {
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe("ok");
    expect(data.database).toBe("connected");
    expect(data.timestamp).toBeDefined();
  });

  it("returns 503 when database query fails", async () => {
    const { db } = await import("@/lib/db");
    const original = db.$queryRaw.bind(db);
    db.$queryRaw = vi.fn().mockRejectedValue(new Error("Connection refused")) as any;

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data.status).toBe("degraded");
    expect(data.database).toBe("disconnected");

    db.$queryRaw = original;
  });
});
