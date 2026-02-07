import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { pulseGuard, type PulseGuardOptions } from "../middleware.js";
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
// Helpers — minimal Express-like req/res/next mocks
// ============================================================================

interface MockReq {
  headers: Record<string, string | string[] | undefined>;
  query?: Record<string, string | string[] | undefined>;
  body?: Record<string, unknown>;
  pulseStatus?: AliveResponse;
}

function mockReq(overrides: Partial<MockReq> = {}): MockReq {
  return {
    headers: {},
    query: {},
    body: {},
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
// Tests
// ============================================================================

describe("pulseGuard", () => {
  const VALID_ADDR = "0x1111111111111111111111111111111111111111";

  describe("address extraction", () => {
    it("reads address from header (default x-agent-address)", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(makeAliveResponse()));

      const mw = pulseGuard({ retries: 0, retryDelayMs: 10 });
      const req = mockReq({ headers: { "x-agent-address": VALID_ADDR } });
      const res = mockRes();
      const next = vi.fn();

      mw(req, res, next);
      // Wait for async
      await vi.waitFor(() => expect(next).toHaveBeenCalledOnce());
    });

    it("reads address from custom header", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(makeAliveResponse()));

      const mw = pulseGuard({
        headerName: "x-agent-id",
        retries: 0,
        retryDelayMs: 10,
      });
      const req = mockReq({ headers: { "x-agent-id": VALID_ADDR } });
      const res = mockRes();
      const next = vi.fn();

      mw(req, res, next);
      await vi.waitFor(() => expect(next).toHaveBeenCalledOnce());
    });

    it("reads address from query param", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(makeAliveResponse()));

      const mw = pulseGuard({ retries: 0, retryDelayMs: 10 });
      const req = mockReq({ query: { agent: VALID_ADDR } });
      const res = mockRes();
      const next = vi.fn();

      mw(req, res, next);
      await vi.waitFor(() => expect(next).toHaveBeenCalledOnce());
    });

    it("reads address from body field", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(makeAliveResponse()));

      const mw = pulseGuard({ retries: 0, retryDelayMs: 10 });
      const req = mockReq({ body: { agentAddress: VALID_ADDR } });
      const res = mockRes();
      const next = vi.fn();

      mw(req, res, next);
      await vi.waitFor(() => expect(next).toHaveBeenCalledOnce());
    });

    it("prefers header over query and body", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(makeAliveResponse()));

      const mw = pulseGuard({ retries: 0, retryDelayMs: 10 });
      const req = mockReq({
        headers: { "x-agent-address": VALID_ADDR },
        query: { agent: "0x2222222222222222222222222222222222222222" },
        body: { agentAddress: "0x3333333333333333333333333333333333333333" },
      });
      const res = mockRes();
      const next = vi.fn();

      mw(req, res, next);
      await vi.waitFor(() => expect(next).toHaveBeenCalledOnce());

      // Should have called the API with the header address
      const calledUrl = mockFetch.mock.calls[0]![0] as string;
      expect(calledUrl).toContain(VALID_ADDR);
    });
  });

  describe("missing address", () => {
    it("returns 400 when no address and allowMissing=false", () => {
      const mw = pulseGuard();
      const req = mockReq();
      const res = mockRes();
      const next = vi.fn();

      mw(req, res, next);

      expect(res.statusCode).toBe(400);
      expect((res.body as Record<string, unknown>).error).toBe("MISSING_AGENT_ADDRESS");
      expect(next).not.toHaveBeenCalled();
    });

    it("passes through when no address and allowMissing=true", () => {
      const mw = pulseGuard({ allowMissing: true });
      const req = mockReq();
      const res = mockRes();
      const next = vi.fn();

      mw(req, res, next);

      expect(next).toHaveBeenCalledOnce();
      expect(res.statusCode).toBe(0);
    });
  });

  describe("invalid address", () => {
    it("returns 400 for malformed address", () => {
      const mw = pulseGuard();
      const req = mockReq({ headers: { "x-agent-address": "not-an-address" } });
      const res = mockRes();
      const next = vi.fn();

      mw(req, res, next);

      expect(res.statusCode).toBe(400);
      expect((res.body as Record<string, unknown>).error).toBe("INVALID_AGENT_ADDRESS");
    });
  });

  describe("alive agent", () => {
    it("calls next() for alive agent", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(makeAliveResponse()));

      const mw = pulseGuard({ retries: 0, retryDelayMs: 10 });
      const req = mockReq({ headers: { "x-agent-address": VALID_ADDR } });
      const res = mockRes();
      const next = vi.fn();

      mw(req, res, next);
      await vi.waitFor(() => expect(next).toHaveBeenCalledOnce());

      expect(res.statusCode).toBe(0); // Not set — request passed through
    });

    it("attaches pulseStatus to the request", async () => {
      const status = makeAliveResponse({ streak: 42 });
      mockFetch.mockResolvedValueOnce(jsonResponse(status));

      const mw = pulseGuard({ retries: 0, retryDelayMs: 10 });
      const req = mockReq({ headers: { "x-agent-address": VALID_ADDR } });
      const res = mockRes();
      const next = vi.fn();

      mw(req, res, next);
      await vi.waitFor(() => expect(next).toHaveBeenCalledOnce());

      expect((req as Record<string, unknown>)["pulseStatus"]).toBeDefined();
    });
  });

  describe("dead agent", () => {
    it("returns 403 for dead agent", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse(makeAliveResponse({ isAlive: false })),
      );

      const mw = pulseGuard({ retries: 0, retryDelayMs: 10 });
      const req = mockReq({ headers: { "x-agent-address": VALID_ADDR } });
      const res = mockRes();
      const next = vi.fn();

      mw(req, res, next);
      await vi.waitFor(() => expect(res.statusCode).toBe(403));

      expect((res.body as Record<string, unknown>).error).toBe("AGENT_HAS_NO_PULSE");
      expect(next).not.toHaveBeenCalled();
    });

    it("returns 403 when alive but exceeds threshold", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse(makeAliveResponse({ isAlive: true, staleness: 7200 })),
      );

      const mw = pulseGuard({ threshold: 3600, retries: 0, retryDelayMs: 10 });
      const req = mockReq({ headers: { "x-agent-address": VALID_ADDR } });
      const res = mockRes();
      const next = vi.fn();

      mw(req, res, next);
      await vi.waitFor(() => expect(res.statusCode).toBe(403));

      expect(next).not.toHaveBeenCalled();
    });

    it("calls custom onRejected handler", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse(makeAliveResponse({ isAlive: false })),
      );

      const onRejected = vi.fn();
      const mw = pulseGuard({ onRejected, retries: 0, retryDelayMs: 10 });
      const req = mockReq({ headers: { "x-agent-address": VALID_ADDR } });
      const res = mockRes();
      const next = vi.fn();

      mw(req, res, next);
      await vi.waitFor(() => expect(onRejected).toHaveBeenCalledOnce());

      expect(onRejected).toHaveBeenCalledWith(
        req,
        res,
        next,
        expect.objectContaining({ address: VALID_ADDR }),
      );
    });
  });

  describe("error handling", () => {
    it("fails open on network error (calls next with warning header)", async () => {
      mockFetch.mockRejectedValue(new Error("ECONNREFUSED"));

      const mw = pulseGuard({ retries: 0, retryDelayMs: 10 });
      const req = mockReq({ headers: { "x-agent-address": VALID_ADDR } });
      const res = mockRes();
      const next = vi.fn();

      mw(req, res, next);
      await vi.waitFor(() => expect(next).toHaveBeenCalledOnce());

      expect(res.headers["X-Pulse-Warning"]).toContain("ECONNREFUSED");
    });
  });
});
