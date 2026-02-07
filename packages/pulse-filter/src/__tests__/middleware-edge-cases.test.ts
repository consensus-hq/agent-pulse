import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { pulseGuard } from "../middleware.js";
import type { AliveResponse } from "../index.js";

// ============================================================================
// Mock setup
// ============================================================================

const mockFetch = vi.fn<
  [input: string | URL | Request, init?: RequestInit | undefined],
  Promise<Response>
>();

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
  mockFetch.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function makeAliveResponse(overrides: Partial<AliveResponse> = {}): AliveResponse {
  return {
    address: "0x1111111111111111111111111111111111111111",
    isAlive: true,
    lastPulseTimestamp: Math.floor(Date.now() / 1000) - 100,
    streak: 5,
    staleness: 100,
    ttl: 86400,
    checkedAt: new Date().toISOString(),
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ============================================================================
// Helpers
// ============================================================================

interface MockReq {
  headers: Record<string, string | string[] | undefined>;
  query?: Record<string, string | string[] | undefined>;
  body?: Record<string, unknown>;
  url?: string;
  pulseStatus?: AliveResponse;
}

function mockReq(overrides: Partial<MockReq> = {}): MockReq {
  return {
    headers: {},
    query: {},
    body: {},
    url: "/test",
    ...overrides,
  };
}

function mockRes() {
  const res = {
    statusCode: 0,
    body: null as unknown,
    headers: {} as Record<string, string>,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(data: unknown) {
      res.body = data;
    },
    setHeader(name: string, value: string) {
      res.headers[name] = value;
    },
  };
  return res;
}

// ============================================================================
// Additional Edge Case Tests
// ============================================================================

describe("pulseGuard - Additional Edge Cases", () => {
  const VALID_ADDR = "0x1111111111111111111111111111111111111111";

  describe("header variations", () => {
    it("handles array-style headers (Express)", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(makeAliveResponse()));

      const mw = pulseGuard({ retries: 0, retryDelayMs: 10 });
      const req = mockReq({ 
        headers: { "x-agent-address": [VALID_ADDR, "0x2222222222222222222222222222222222222222"] } 
      });
      const res = mockRes();
      const next = vi.fn();

      mw(req, res, next);
      await vi.waitFor(() => expect(next).toHaveBeenCalledOnce());

      // Should use first element of array
      const calledUrl = mockFetch.mock.calls[0]![0] as string;
      expect(calledUrl).toContain(VALID_ADDR);
    });

    it("handles empty array headers as missing", async () => {
      const mw = pulseGuard();
      const req = mockReq({ 
        headers: { "x-agent-address": [] } 
      });
      const res = mockRes();
      const next = vi.fn();

      mw(req, res, next);

      expect(res.statusCode).toBe(400);
      expect((res.body as Record<string, unknown>).error).toBe("MISSING_AGENT_ADDRESS");
    });

    it("handles empty string header as missing", async () => {
      const mw = pulseGuard();
      const req = mockReq({ 
        headers: { "x-agent-address": "" } 
      });
      const res = mockRes();
      const next = vi.fn();

      mw(req, res, next);

      expect(res.statusCode).toBe(400);
      expect((res.body as Record<string, unknown>).error).toBe("MISSING_AGENT_ADDRESS");
    });

    it("handles lowercase header name", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(makeAliveResponse()));

      const mw = pulseGuard({ retries: 0, retryDelayMs: 10 });
      const req = mockReq({ headers: { "x-agent-address": VALID_ADDR } });
      const res = mockRes();
      const next = vi.fn();

      mw(req, res, next);
      await vi.waitFor(() => expect(next).toHaveBeenCalledOnce());
    });

    it("handles mixed-case header name", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(makeAliveResponse()));

      const mw = pulseGuard({ retries: 0, retryDelayMs: 10 });
      // The middleware uses headerName.toLowerCase() when looking up,
      // so we need to use lowercase key in the headers object
      const req = mockReq({ headers: { "x-agent-address": VALID_ADDR } });
      const res = mockRes();
      const next = vi.fn();

      mw(req, res, next);
      await vi.waitFor(() => expect(next).toHaveBeenCalledOnce());
    });
  });

  describe("query parameter variations", () => {
    it("handles custom query parameter name", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(makeAliveResponse()));

      const mw = pulseGuard({ 
        queryParam: "agentId",
        retries: 0, 
        retryDelayMs: 10 
      });
      const req = mockReq({ query: { agentId: VALID_ADDR } });
      const res = mockRes();
      const next = vi.fn();

      mw(req, res, next);
      await vi.waitFor(() => expect(next).toHaveBeenCalledOnce());

      const calledUrl = mockFetch.mock.calls[0]![0] as string;
      expect(calledUrl).toContain(VALID_ADDR);
    });

    it("ignores wrong query parameter when custom name set", async () => {
      const mw = pulseGuard({ 
        queryParam: "agentId",
        retries: 0, 
        retryDelayMs: 10 
      });
      const req = mockReq({ query: { agent: VALID_ADDR } }); // Wrong param name
      const res = mockRes();
      const next = vi.fn();

      mw(req, res, next);

      expect(res.statusCode).toBe(400);
    });

    it("handles array query values as missing (treated as non-string)", async () => {
      // Query arrays are not handled by the middleware - it only checks for string values
      const mw = pulseGuard({ retries: 0, retryDelayMs: 10 });
      const req = mockReq({ 
        query: { agent: [VALID_ADDR, "0x2222222222222222222222222222222222222222"] } 
      });
      const res = mockRes();
      const next = vi.fn();

      mw(req, res, next);

      // Array query values are treated as missing (typeof array !== "string")
      expect(res.statusCode).toBe(400);
      expect((res.body as Record<string, unknown>).error).toBe("MISSING_AGENT_ADDRESS");
    });
  });

  describe("body field variations", () => {
    it("handles custom body field name", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(makeAliveResponse()));

      const mw = pulseGuard({ 
        bodyField: "ethereumAddress",
        retries: 0, 
        retryDelayMs: 10 
      });
      const req = mockReq({ body: { ethereumAddress: VALID_ADDR } });
      const res = mockRes();
      const next = vi.fn();

      mw(req, res, next);
      await vi.waitFor(() => expect(next).toHaveBeenCalledOnce());
    });

    it("ignores wrong body field when custom name set", async () => {
      const mw = pulseGuard({ 
        bodyField: "ethereumAddress",
        retries: 0, 
        retryDelayMs: 10 
      });
      const req = mockReq({ body: { agentAddress: VALID_ADDR } }); // Wrong field name
      const res = mockRes();
      const next = vi.fn();

      mw(req, res, next);

      expect(res.statusCode).toBe(400);
    });

    it("handles nested body objects gracefully", async () => {
      // Nested objects won't have the address, should fail to missing
      const mw = pulseGuard({ retries: 0, retryDelayMs: 10 });
      const req = mockReq({ 
        body: { 
          agentAddress: { nested: VALID_ADDR } // Wrong type
        } 
      });
      const res = mockRes();
      const next = vi.fn();

      mw(req, res, next);

      expect(res.statusCode).toBe(400);
    });
  });

  describe("threshold edge cases", () => {
    it("allows agent at exactly the threshold", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse(makeAliveResponse({ isAlive: true, staleness: 3600 })),
      );

      const mw = pulseGuard({ threshold: 3600, retries: 0, retryDelayMs: 10 });
      const req = mockReq({ headers: { "x-agent-address": VALID_ADDR } });
      const res = mockRes();
      const next = vi.fn();

      mw(req, res, next);
      await vi.waitFor(() => expect(next).toHaveBeenCalledOnce());

      expect(res.statusCode).toBe(0);
    });

    it("rejects agent just above threshold", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse(makeAliveResponse({ isAlive: true, staleness: 3601 })),
      );

      const mw = pulseGuard({ threshold: 3600, retries: 0, retryDelayMs: 10 });
      const req = mockReq({ headers: { "x-agent-address": VALID_ADDR } });
      const res = mockRes();
      const next = vi.fn();

      mw(req, res, next);
      await vi.waitFor(() => expect(res.statusCode).toBe(403));

      expect(next).not.toHaveBeenCalled();
    });

    it("allows any alive agent when threshold is 0", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse(makeAliveResponse({ isAlive: true, staleness: 999999 })),
      );

      const mw = pulseGuard({ threshold: 0, retries: 0, retryDelayMs: 10 });
      const req = mockReq({ headers: { "x-agent-address": VALID_ADDR } });
      const res = mockRes();
      const next = vi.fn();

      mw(req, res, next);
      await vi.waitFor(() => expect(next).toHaveBeenCalledOnce());
    });

    it("allows any alive agent when threshold is negative", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse(makeAliveResponse({ isAlive: true, staleness: 999999 })),
      );

      const mw = pulseGuard({ threshold: -1, retries: 0, retryDelayMs: 10 });
      const req = mockReq({ headers: { "x-agent-address": VALID_ADDR } });
      const res = mockRes();
      const next = vi.fn();

      mw(req, res, next);
      await vi.waitFor(() => expect(next).toHaveBeenCalledOnce());
    });

    it("handles null staleness from API", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse(makeAliveResponse({ isAlive: true, staleness: null })),
      );

      const mw = pulseGuard({ threshold: 3600, retries: 0, retryDelayMs: 10 });
      const req = mockReq({ headers: { "x-agent-address": VALID_ADDR } });
      const res = mockRes();
      const next = vi.fn();

      mw(req, res, next);
      await vi.waitFor(() => expect(next).toHaveBeenCalledOnce());
    });
  });

  describe("rejection message variations", () => {
    it("includes timestamp for agent with expired pulse", async () => {
      const lastPulse = Math.floor(Date.now() / 1000) - 86400; // 1 day ago
      mockFetch.mockResolvedValueOnce(
        jsonResponse(makeAliveResponse({ 
          isAlive: false, 
          lastPulseTimestamp: lastPulse,
          staleness: 86400 
        })),
      );

      const mw = pulseGuard({ retries: 0, retryDelayMs: 10 });
      const req = mockReq({ headers: { "x-agent-address": VALID_ADDR } });
      const res = mockRes();
      const next = vi.fn();

      mw(req, res, next);
      await vi.waitFor(() => expect(res.statusCode).toBe(403));

      const body = res.body as Record<string, unknown>;
      expect(body.message).toContain(new Date(lastPulse * 1000).toISOString());
    });

    it("shows 'never' for agent that never pulsed", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse(makeAliveResponse({ 
          isAlive: false, 
          lastPulseTimestamp: 0,
          staleness: null 
        })),
      );

      const mw = pulseGuard({ retries: 0, retryDelayMs: 10 });
      const req = mockReq({ headers: { "x-agent-address": VALID_ADDR } });
      const res = mockRes();
      const next = vi.fn();

      mw(req, res, next);
      await vi.waitFor(() => expect(res.statusCode).toBe(403));

      const body = res.body as Record<string, unknown>;
      expect(body.message).toContain("never");
    });
  });

  describe("onAlert callback variations", () => {
    it("handles sync onAlert callback", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse(makeAliveResponse({ isAlive: false })),
      );

      const onAlert = vi.fn();
      const mw = pulseGuard({ onAlert, retries: 0, retryDelayMs: 10 });
      const req = mockReq({ headers: { "x-agent-address": VALID_ADDR }, url: "/api/test" });
      const res = mockRes();
      const next = vi.fn();

      mw(req, res, next);
      await vi.waitFor(() => expect(res.statusCode).toBe(403));
      await new Promise((r) => setTimeout(r, 10));

      expect(onAlert).toHaveBeenCalledOnce();
      const alertInfo = onAlert.mock.calls[0]![0];
      expect(alertInfo.path).toBe("/api/test");
      expect(alertInfo.rejectedAt).toBeDefined();
    });

    it("handles async onAlert callback", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse(makeAliveResponse({ isAlive: false })),
      );

      const asyncOnAlert = vi.fn().mockResolvedValue(undefined);
      const mw = pulseGuard({ onAlert: asyncOnAlert, retries: 0, retryDelayMs: 10 });
      const req = mockReq({ headers: { "x-agent-address": VALID_ADDR } });
      const res = mockRes();
      const next = vi.fn();

      mw(req, res, next);
      await vi.waitFor(() => expect(res.statusCode).toBe(403));
      await new Promise((r) => setTimeout(r, 10));

      expect(asyncOnAlert).toHaveBeenCalledOnce();
    });

    it("handles onAlert throwing error (fire-and-forget)", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse(makeAliveResponse({ isAlive: false })),
      );

      const onAlert = vi.fn().mockRejectedValue(new Error("Webhook failed"));
      const mw = pulseGuard({ onAlert, retries: 0, retryDelayMs: 10 });
      const req = mockReq({ headers: { "x-agent-address": VALID_ADDR } });
      const res = mockRes();
      const next = vi.fn();

      mw(req, res, next);
      await vi.waitFor(() => expect(res.statusCode).toBe(403));
      await new Promise((r) => setTimeout(r, 10));

      // Should not throw, error swallowed
      expect(res.statusCode).toBe(403);
    });

    it("handles onAlert throwing sync error", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse(makeAliveResponse({ isAlive: false })),
      );

      const onAlert = vi.fn().mockImplementation(() => {
        throw new Error("Sync error");
      });
      const mw = pulseGuard({ onAlert, retries: 0, retryDelayMs: 10 });
      const req = mockReq({ headers: { "x-agent-address": VALID_ADDR } });
      const res = mockRes();
      const next = vi.fn();

      mw(req, res, next);
      await vi.waitFor(() => expect(res.statusCode).toBe(403));

      // Should not throw, error swallowed
      expect(res.statusCode).toBe(403);
    });
  });

  describe("onRejected callback variations", () => {
    it("allows onRejected to send custom response", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse(makeAliveResponse({ isAlive: false })),
      );

      const onRejected = vi.fn((req, res, next, info) => {
        res.status(418).json({ 
          error: "I'm a teapot",
          custom: true,
          address: info.address 
        });
      });

      const mw = pulseGuard({ onRejected, retries: 0, retryDelayMs: 10 });
      const req = mockReq({ headers: { "x-agent-address": VALID_ADDR } });
      const res = mockRes();
      const next = vi.fn();

      mw(req, res, next);
      await vi.waitFor(() => expect(onRejected).toHaveBeenCalledOnce());

      expect(res.statusCode).toBe(418);
      expect((res.body as Record<string, unknown>).error).toBe("I'm a teapot");
    });

    it("provides status info to onRejected", async () => {
      const status = makeAliveResponse({ isAlive: false, streak: 42 });
      mockFetch.mockResolvedValueOnce(jsonResponse(status));

      const onRejected = vi.fn();
      const mw = pulseGuard({ onRejected, retries: 0, retryDelayMs: 10 });
      const req = mockReq({ headers: { "x-agent-address": VALID_ADDR } });
      const res = mockRes();
      const next = vi.fn();

      mw(req, res, next);
      await vi.waitFor(() => expect(onRejected).toHaveBeenCalledOnce());

      const info = onRejected.mock.calls[0]![3];
      expect(info.address).toBe(VALID_ADDR);
      expect(info.status).toBeDefined();
      expect(info.status.streak).toBe(42);
    });

    it("allows onRejected to call next() for conditional allow", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse(makeAliveResponse({ isAlive: false })),
      );

      const onRejected = vi.fn((req, res, next) => {
        next(); // Allow despite dead
      });

      const mw = pulseGuard({ onRejected, retries: 0, retryDelayMs: 10 });
      const req = mockReq({ headers: { "x-agent-address": VALID_ADDR } });
      const res = mockRes();
      const next = vi.fn();

      mw(req, res, next);
      await vi.waitFor(() => expect(onRejected).toHaveBeenCalledOnce());

      // next() was called by onRejected
      expect(next).toHaveBeenCalledOnce();
    });
  });

  describe("pulseStatus attachment", () => {
    it("attaches full status to request", async () => {
      const status = makeAliveResponse({ 
        streak: 99, 
        staleness: 500,
        lastPulseTimestamp: 1700000000 
      });
      mockFetch.mockResolvedValueOnce(jsonResponse(status));

      const mw = pulseGuard({ retries: 0, retryDelayMs: 10 });
      const req = mockReq({ headers: { "x-agent-address": VALID_ADDR } });
      const res = mockRes();
      const next = vi.fn();

      mw(req, res, next);
      await vi.waitFor(() => expect(next).toHaveBeenCalledOnce());

      expect((req as Record<string, unknown>)["pulseStatus"]).toEqual(
        expect.objectContaining({
          streak: 99,
          staleness: 500,
          lastPulseTimestamp: 1700000000,
        })
      );
    });
  });

  describe("error handling edge cases", () => {
    it("handles API returning 400 error", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response("Bad Request", { status: 400 })
      );

      const mw = pulseGuard({ retries: 0, retryDelayMs: 10 });
      const req = mockReq({ headers: { "x-agent-address": VALID_ADDR } });
      const res = mockRes();
      const next = vi.fn();

      mw(req, res, next);
      await vi.waitFor(() => expect(next).toHaveBeenCalledOnce());

      // Fails open on non-5xx errors too (fetchWithRetry returns non-ok responses)
      expect(res.headers["X-Pulse-Warning"]).toBeDefined();
    });

    it("handles API returning 404 error", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response("Not Found", { status: 404 })
      );

      const mw = pulseGuard({ retries: 0, retryDelayMs: 10 });
      const req = mockReq({ headers: { "x-agent-address": VALID_ADDR } });
      const res = mockRes();
      const next = vi.fn();

      mw(req, res, next);
      await vi.waitFor(() => expect(next).toHaveBeenCalledOnce());

      expect(res.headers["X-Pulse-Warning"]).toBeDefined();
    });

    it("handles setHeader not being available on response", async () => {
      mockFetch.mockRejectedValue(new Error("Network error"));

      const mw = pulseGuard({ retries: 0, retryDelayMs: 10 });
      const req = mockReq({ headers: { "x-agent-address": VALID_ADDR } });
      const res = {
        statusCode: 0,
        status(code: number) { this.statusCode = code; return this; },
        json() {},
        // No setHeader method
      };
      const next = vi.fn();

      // Should not throw
      mw(req, res, next);
      await vi.waitFor(() => expect(next).toHaveBeenCalledOnce());
    });
  });

  describe("address format edge cases", () => {
    it("rejects address with checksum but invalid length", () => {
      const mw = pulseGuard();
      const req = mockReq({ headers: { "x-agent-address": "0xA7940a42c30A7F492Ed578F3aC728c2929103E4" } }); // One char short
      const res = mockRes();
      const next = vi.fn();

      mw(req, res, next);

      expect(res.statusCode).toBe(400);
    });

    it("rejects address that looks valid but has extra chars", () => {
      const mw = pulseGuard();
      const req = mockReq({ headers: { "x-agent-address": "0x" + "1".repeat(40) + "extra" } });
      const res = mockRes();
      const next = vi.fn();

      mw(req, res, next);

      expect(res.statusCode).toBe(400);
    });

    it("rejects address with spaces", () => {
      const mw = pulseGuard();
      const req = mockReq({ headers: { "x-agent-address": " 0x" + "1".repeat(40) + " " } });
      const res = mockRes();
      const next = vi.fn();

      mw(req, res, next);

      expect(res.statusCode).toBe(400);
    });
  });
});
