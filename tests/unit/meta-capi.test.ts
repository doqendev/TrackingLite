import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sendToMetaCapi, MetaCapiError } from "@/lib/meta-capi";
import type { MetaCapiEvent } from "@/types/meta-capi";

const PIXEL_ID = "1234567890";
const ACCESS_TOKEN = "test-access-token";

const SAMPLE_EVENT: MetaCapiEvent = {
  event_name: "PageView",
  event_time: 1700000000,
  event_id: "evt-001",
  action_source: "website",
  user_data: {
    client_ip_address: "1.2.3.4",
    client_user_agent: "Mozilla/5.0",
  },
};

function makeFetchResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

describe("sendToMetaCapi", () => {
  beforeEach(() => {
    vi.spyOn(global, "fetch").mockImplementation(() =>
      Promise.resolve(
        makeFetchResponse(200, {
          events_received: 1,
          messages: [],
          fbtrace_id: "trace-001",
        })
      )
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("URL construction", () => {
    it("constructs the correct URL with pixel ID and API version", async () => {
      await sendToMetaCapi(PIXEL_ID, ACCESS_TOKEN, [SAMPLE_EVENT]);

      const [calledUrl] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(calledUrl).toMatch(/^https:\/\/graph\.facebook\.com\//);
      expect(calledUrl).toContain(`/${PIXEL_ID}/events`);
    });

    it("includes the API version segment in the URL", async () => {
      await sendToMetaCapi(PIXEL_ID, ACCESS_TOKEN, [SAMPLE_EVENT]);

      const [calledUrl] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      // Should contain a version like v21.0 or whatever META_API_VERSION resolves to
      expect(calledUrl).toMatch(/\/v\d+\.\d+\//);
    });

    it("uses different pixel IDs in the URL", async () => {
      const otherPixelId = "9876543210";
      await sendToMetaCapi(otherPixelId, ACCESS_TOKEN, [SAMPLE_EVENT]);

      const [calledUrl] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(calledUrl).toContain(`/${otherPixelId}/events`);
    });
  });

  describe("request body", () => {
    it("includes the access token in the request body", async () => {
      await sendToMetaCapi(PIXEL_ID, ACCESS_TOKEN, [SAMPLE_EVENT]);

      const [, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.access_token).toBe(ACCESS_TOKEN);
    });

    it("sends event data as the 'data' array in the body", async () => {
      await sendToMetaCapi(PIXEL_ID, ACCESS_TOKEN, [SAMPLE_EVENT]);

      const [, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].event_name).toBe("PageView");
      expect(body.data[0].event_id).toBe("evt-001");
    });

    it("sends multiple events in the data array", async () => {
      const secondEvent: MetaCapiEvent = { ...SAMPLE_EVENT, event_name: "ViewContent", event_id: "evt-002" };
      await sendToMetaCapi(PIXEL_ID, ACCESS_TOKEN, [SAMPLE_EVENT, secondEvent]);

      const [, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.data).toHaveLength(2);
    });

    it("omits test_event_code when not provided", async () => {
      await sendToMetaCapi(PIXEL_ID, ACCESS_TOKEN, [SAMPLE_EVENT]);

      const [, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.test_event_code).toBeUndefined();
    });

    it("includes test_event_code when provided", async () => {
      await sendToMetaCapi(PIXEL_ID, ACCESS_TOKEN, [SAMPLE_EVENT], "TEST123");

      const [, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.test_event_code).toBe("TEST123");
    });

    it("uses POST method with JSON content type", async () => {
      await sendToMetaCapi(PIXEL_ID, ACCESS_TOKEN, [SAMPLE_EVENT]);

      const [, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(options.method).toBe("POST");
      expect(options.headers["Content-Type"]).toBe("application/json");
    });
  });

  describe("successful response", () => {
    it("returns the parsed response on success", async () => {
      const result = await sendToMetaCapi(PIXEL_ID, ACCESS_TOKEN, [SAMPLE_EVENT]);
      expect(result.events_received).toBe(1);
      expect(result.fbtrace_id).toBe("trace-001");
    });
  });

  describe("error handling", () => {
    it("throws MetaCapiError on 400 bad request", async () => {
      vi.spyOn(global, "fetch").mockResolvedValueOnce(
        makeFetchResponse(400, {
          error: { message: "Invalid parameter", type: "OAuthException", code: 100, fbtrace_id: "trace-400" },
        })
      );

      await expect(sendToMetaCapi(PIXEL_ID, ACCESS_TOKEN, [SAMPLE_EVENT])).rejects.toThrow(MetaCapiError);
    });

    it("sets correct statusCode on 400 error", async () => {
      vi.spyOn(global, "fetch").mockResolvedValueOnce(
        makeFetchResponse(400, {
          error: { message: "Invalid parameter", type: "OAuthException", code: 100, fbtrace_id: "trace-400" },
        })
      );

      let caught: MetaCapiError | null = null;
      try {
        await sendToMetaCapi(PIXEL_ID, ACCESS_TOKEN, [SAMPLE_EVENT]);
      } catch (e) {
        caught = e as MetaCapiError;
      }
      expect(caught?.statusCode).toBe(400);
    });

    it("throws MetaCapiError on 403 invalid token", async () => {
      vi.spyOn(global, "fetch").mockResolvedValueOnce(
        makeFetchResponse(403, {
          error: { message: "Invalid OAuth access token", type: "OAuthException", code: 190, fbtrace_id: "trace-403" },
        })
      );

      let caught: MetaCapiError | null = null;
      try {
        await sendToMetaCapi(PIXEL_ID, ACCESS_TOKEN, [SAMPLE_EVENT]);
      } catch (e) {
        caught = e as MetaCapiError;
      }
      expect(caught).toBeInstanceOf(MetaCapiError);
      expect(caught?.statusCode).toBe(403);
      expect(caught?.message).toBe("Invalid OAuth access token");
    });

    it("throws MetaCapiError on 429 rate limit", async () => {
      vi.spyOn(global, "fetch").mockResolvedValueOnce(
        makeFetchResponse(429, {
          error: { message: "Application request limit reached", type: "OAuthException", code: 4, fbtrace_id: "trace-429" },
        })
      );

      let caught: MetaCapiError | null = null;
      try {
        await sendToMetaCapi(PIXEL_ID, ACCESS_TOKEN, [SAMPLE_EVENT]);
      } catch (e) {
        caught = e as MetaCapiError;
      }
      expect(caught).toBeInstanceOf(MetaCapiError);
      expect(caught?.statusCode).toBe(429);
    });

    it("throws MetaCapiError on 500 server error", async () => {
      vi.spyOn(global, "fetch").mockResolvedValueOnce(
        makeFetchResponse(500, {
          error: { message: "Internal server error", type: "ServerError", code: 2, fbtrace_id: "trace-500" },
        })
      );

      let caught: MetaCapiError | null = null;
      try {
        await sendToMetaCapi(PIXEL_ID, ACCESS_TOKEN, [SAMPLE_EVENT]);
      } catch (e) {
        caught = e as MetaCapiError;
      }
      expect(caught).toBeInstanceOf(MetaCapiError);
      expect(caught?.statusCode).toBe(500);
    });

    it("uses fallback message when error.message is absent", async () => {
      vi.spyOn(global, "fetch").mockResolvedValueOnce(
        makeFetchResponse(503, {})
      );

      let caught: MetaCapiError | null = null;
      try {
        await sendToMetaCapi(PIXEL_ID, ACCESS_TOKEN, [SAMPLE_EVENT]);
      } catch (e) {
        caught = e as MetaCapiError;
      }
      expect(caught?.message).toBe("Unknown Meta CAPI error");
    });

    it("attaches the raw response body to the error", async () => {
      const errorBody = {
        error: { message: "Bad request", type: "OAuthException", code: 100, fbtrace_id: "trace-x" },
      };
      vi.spyOn(global, "fetch").mockResolvedValueOnce(makeFetchResponse(400, errorBody));

      let caught: MetaCapiError | null = null;
      try {
        await sendToMetaCapi(PIXEL_ID, ACCESS_TOKEN, [SAMPLE_EVENT]);
      } catch (e) {
        caught = e as MetaCapiError;
      }
      expect(caught?.response).toEqual(errorBody);
    });
  });

  describe("MetaCapiError class", () => {
    it("has the correct name property", () => {
      const err = new MetaCapiError("something went wrong", 400, { detail: "x" });
      expect(err.name).toBe("MetaCapiError");
    });

    it("exposes statusCode", () => {
      const err = new MetaCapiError("oops", 403, null);
      expect(err.statusCode).toBe(403);
    });

    it("exposes the response payload", () => {
      const payload = { error: { code: 190 } };
      const err = new MetaCapiError("oops", 403, payload);
      expect(err.response).toEqual(payload);
    });

    it("is an instance of Error", () => {
      const err = new MetaCapiError("oops", 500, null);
      expect(err).toBeInstanceOf(Error);
    });
  });
});
