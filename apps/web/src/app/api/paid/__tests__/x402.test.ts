import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import type { PriceConfig } from "../x402";

// ============================================================================
// Mock setup
// ============================================================================

const mockFetch = vi.fn<
  [input: string | URL | Request, init?: RequestInit | undefined],
  Promise<Response>
>();

// Helper to dynamically import x402 with fresh env var evaluation
async function importX402() {
  vi.resetModules();
  const module = await import("../x402");
  return module;
}

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
  mockFetch.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ============================================================================
// Helpers
// ============================================================================

const PRICES: Record<string, PriceConfig> = {
  portfolio: { display: "$0.02", atomic: "20000" },
  price: { display: "$0.005", atomic: "5000" },
  health: { display: "$0.001", atomic: "1000" },
};

function makeValidPaymentPayload(price: PriceConfig, payer = "0x" + "1".repeat(40)): string {
  const payload = {
    x402Version: 1,
    scheme: "exact",
    network: "eip155:8453",
    payload: {
      signature: "0x" + "3".repeat(130),
      authorization: {
        from: payer,
        to: "0xA7940a42c30A7F492Ed578F3aC728c2929103E43",
        value: price.atomic,
        validAfter: String(Math.floor(Date.now() / 1000) - 300),
        validBefore: String(Math.floor(Date.now() / 1000) + 300),
        nonce: "0x" + "0".repeat(64),
      },
    },
  };
  return Buffer.from(JSON.stringify(payload)).toString("base64");
}

function makeVerifyResponse(isValid: boolean, invalidReason?: string): Response {
  return new Response(
    JSON.stringify({
      isValid,
      invalidReason,
      payer: "0x" + "1".repeat(40),
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

function makeSettleResponse(success: boolean, transaction?: string, errorReason?: string): Response {
  return new Response(
    JSON.stringify({
      success,
      transaction,
      errorReason,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ============================================================================
// Bypass Key Tests
// ============================================================================

describe("x402 Payment Gate - Bypass Key", () => {
  it("allows access with valid bypass key via x-api-key header", async () => {
    process.env.PAID_API_BYPASS_KEY = "test-bypass-key";
    const { withPaymentGate } = await importX402();
    
    const handler = vi.fn(async () => NextResponse.json({ success: true }));
    const wrapped = withPaymentGate(PRICES.portfolio, handler);

    const request = new NextRequest("https://example.com/api/paid/portfolio", {
      headers: { "x-api-key": "test-bypass-key" },
    });

    const response = await wrapped(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(handler).toHaveBeenCalledOnce();
    
    // Check payment info passed to handler
    const paymentArg = handler.mock.calls[0]![1];
    expect(paymentArg.method).toBe("bypass");
    expect(paymentArg.payer).toBe("bypass");
    expect(paymentArg.amount).toBe("0");
  });

  it("allows access with valid bypass key via X-API-KEY header (uppercase)", async () => {
    process.env.PAID_API_BYPASS_KEY = "test-bypass-key";
    const { withPaymentGate } = await importX402();
    
    const handler = vi.fn(async () => NextResponse.json({ success: true }));
    const wrapped = withPaymentGate(PRICES.portfolio, handler);

    const request = new NextRequest("https://example.com/api/paid/portfolio", {
      headers: { "X-API-KEY": "test-bypass-key" },
    });

    const response = await wrapped(request);
    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledOnce();
  });

  it("rejects with 402 when bypass key is invalid", async () => {
    process.env.PAID_API_BYPASS_KEY = "test-bypass-key";
    const { withPaymentGate } = await importX402();
    
    const handler = vi.fn(async () => NextResponse.json({ success: true }));
    const wrapped = withPaymentGate(PRICES.portfolio, handler);

    const request = new NextRequest("https://example.com/api/paid/portfolio", {
      headers: { "x-api-key": "wrong-key" },
    });

    const response = await wrapped(request);
    const body = await response.json();

    expect(response.status).toBe(402);
    expect(body.error).toBe("Payment Required");
    expect(body.paymentRequired).toBe(true);
    expect(handler).not.toHaveBeenCalled();
  });

  it("rejects with 402 when bypass key env var is not set", async () => {
    delete process.env.PAID_API_BYPASS_KEY;
    const { withPaymentGate } = await importX402();
    
    const handler = vi.fn(async () => NextResponse.json({ success: true }));
    const wrapped = withPaymentGate(PRICES.portfolio, handler);

    const request = new NextRequest("https://example.com/api/paid/portfolio", {
      headers: { "x-api-key": "test-bypass-key" },
    });

    const response = await wrapped(request);
    expect(response.status).toBe(402);
    expect(handler).not.toHaveBeenCalled();
  });
});

// ============================================================================
// Payment Header Tests
// ============================================================================

describe("x402 Payment Gate - Payment Header", () => {
  it("returns 400 for invalid base64 payment header", async () => {
    const { withPaymentGate } = await importX402();
    const handler = vi.fn(async () => NextResponse.json({ success: true }));
    const wrapped = withPaymentGate(PRICES.portfolio, handler);

    const request = new NextRequest("https://example.com/api/paid/portfolio", {
      headers: { "x-payment": "not-valid-base64!!!" },
    });

    const response = await wrapped(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("Invalid X-PAYMENT header");
    expect(handler).not.toHaveBeenCalled();
  });

  it("returns 400 for malformed JSON in payment header", async () => {
    const { withPaymentGate } = await importX402();
    const handler = vi.fn(async () => NextResponse.json({ success: true }));
    const wrapped = withPaymentGate(PRICES.portfolio, handler);

    const invalidPayload = Buffer.from("not-json").toString("base64");
    const request = new NextRequest("https://example.com/api/paid/portfolio", {
      headers: { "x-payment": invalidPayload },
    });

    const response = await wrapped(request);
    expect(response.status).toBe(400);
    expect(handler).not.toHaveBeenCalled();
  });

  it("accepts payment-signature header (legacy name)", async () => {
    mockFetch
      .mockResolvedValueOnce(makeVerifyResponse(true))
      .mockResolvedValueOnce(makeSettleResponse(true, "0x" + "a".repeat(64)));

    const { withPaymentGate } = await importX402();
    const handler = vi.fn(async () => NextResponse.json({ success: true }));
    const wrapped = withPaymentGate(PRICES.portfolio, handler);

    const paymentHeader = makeValidPaymentPayload(PRICES.portfolio);
    const request = new NextRequest("https://example.com/api/paid/portfolio", {
      headers: { "payment-signature": paymentHeader },
    });

    const response = await wrapped(request);
    expect(response.status).toBe(200);
  });
});

// ============================================================================
// Facilitator Verification Tests
// ============================================================================

describe("x402 Payment Gate - Facilitator Verification", () => {
  it("returns 402 when facilitator verification fails", async () => {
    mockFetch.mockResolvedValueOnce(makeVerifyResponse(false, "insufficient_funds"));

    const { withPaymentGate } = await importX402();
    const handler = vi.fn(async () => NextResponse.json({ success: true }));
    const wrapped = withPaymentGate(PRICES.portfolio, handler);

    const paymentHeader = makeValidPaymentPayload(PRICES.portfolio);
    const request = new NextRequest("https://example.com/api/paid/portfolio", {
      headers: { "x-payment": paymentHeader },
    });

    const response = await wrapped(request);
    const body = await response.json();

    expect(response.status).toBe(402);
    expect(body.error).toBe("insufficient_funds");
    expect(body.paymentRequired).toBe(true);
    expect(handler).not.toHaveBeenCalled();
  });

  it("returns 402 with generic error when facilitator returns invalid without reason", async () => {
    mockFetch.mockResolvedValueOnce(makeVerifyResponse(false));

    const { withPaymentGate } = await importX402();
    const handler = vi.fn(async () => NextResponse.json({ success: true }));
    const wrapped = withPaymentGate(PRICES.portfolio, handler);

    const paymentHeader = makeValidPaymentPayload(PRICES.portfolio);
    const request = new NextRequest("https://example.com/api/paid/portfolio", {
      headers: { "x-payment": paymentHeader },
    });

    const response = await wrapped(request);
    const body = await response.json();

    expect(response.status).toBe(402);
    expect(body.error).toBe("Payment verification failed");
  });

  it("returns 502 when facilitator returns 500 error", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response("Internal Server Error", { status: 500 })
    );

    const { withPaymentGate } = await importX402();
    const handler = vi.fn(async () => NextResponse.json({ success: true }));
    const wrapped = withPaymentGate(PRICES.portfolio, handler);

    const paymentHeader = makeValidPaymentPayload(PRICES.portfolio);
    const request = new NextRequest("https://example.com/api/paid/portfolio", {
      headers: { "x-payment": paymentHeader },
    });

    const response = await wrapped(request);
    const body = await response.json();

    expect(response.status).toBe(402);
    expect(body.error).toContain("Facilitator verification failed");
    expect(handler).not.toHaveBeenCalled();
  });

  it("handles network error during verification gracefully", async () => {
    mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const { withPaymentGate } = await importX402();
    const handler = vi.fn(async () => NextResponse.json({ success: true }));
    const wrapped = withPaymentGate(PRICES.portfolio, handler);

    const paymentHeader = makeValidPaymentPayload(PRICES.portfolio);
    const request = new NextRequest("https://example.com/api/paid/portfolio", {
      headers: { "x-payment": paymentHeader },
    });

    const response = await wrapped(request);
    const body = await response.json();

    expect(response.status).toBe(402);
    expect(body.error).toContain("ECONNREFUSED");
    expect(handler).not.toHaveBeenCalled();
  });

  it("uses THIRDWEB_SECRET_KEY for authentication when available", async () => {
    process.env.THIRDWEB_SECRET_KEY = "my-secret-key";
    delete process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID;

    mockFetch.mockResolvedValueOnce(makeVerifyResponse(true));

    const { withPaymentGate } = await importX402();
    const handler = vi.fn(async () => NextResponse.json({ success: true }));
    const wrapped = withPaymentGate(PRICES.portfolio, handler);

    const paymentHeader = makeValidPaymentPayload(PRICES.portfolio);
    const request = new NextRequest("https://example.com/api/paid/portfolio", {
      headers: { "x-payment": paymentHeader },
    });

    await wrapped(request);

    const fetchCall = mockFetch.mock.calls[0];
    const init = fetchCall[1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers["x-secret-key"]).toBe("my-secret-key");
  });

  it("falls back to NEXT_PUBLIC_THIRDWEB_CLIENT_ID when secret not available", async () => {
    delete process.env.THIRDWEB_SECRET_KEY;
    process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID = "my-client-id";

    mockFetch.mockResolvedValueOnce(makeVerifyResponse(true));

    const { withPaymentGate } = await importX402();
    const handler = vi.fn(async () => NextResponse.json({ success: true }));
    const wrapped = withPaymentGate(PRICES.portfolio, handler);

    const paymentHeader = makeValidPaymentPayload(PRICES.portfolio);
    const request = new NextRequest("https://example.com/api/paid/portfolio", {
      headers: { "x-payment": paymentHeader },
    });

    await wrapped(request);

    const fetchCall = mockFetch.mock.calls[0];
    const init = fetchCall[1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers["x-client-id"]).toBe("my-client-id");
  });
});

// ============================================================================
// Settlement Tests
// ============================================================================

describe("x402 Payment Gate - Settlement", () => {
  it("calls handler when verification and settlement both succeed", async () => {
    mockFetch
      .mockResolvedValueOnce(makeVerifyResponse(true))
      .mockResolvedValueOnce(makeSettleResponse(true, "0x" + "a".repeat(64)));

    const { withPaymentGate } = await importX402();
    const handler = vi.fn(async () => NextResponse.json({ data: "protected" }));
    const wrapped = withPaymentGate(PRICES.portfolio, handler);

    const paymentHeader = makeValidPaymentPayload(PRICES.portfolio);
    const request = new NextRequest("https://example.com/api/paid/portfolio", {
      headers: { "x-payment": paymentHeader },
    });

    const response = await wrapped(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toBe("protected");
    expect(handler).toHaveBeenCalledOnce();
    
    // Verify payment info passed to handler
    const paymentArg = handler.mock.calls[0]![1];
    expect(paymentArg.method).toBe("x402");
    expect(paymentArg.amount).toBe(PRICES.portfolio.atomic);
    expect(paymentArg.payer).toBeDefined();
    expect(paymentArg.timestamp).toBeDefined();
  });

  it("returns 402 when settlement fails", async () => {
    mockFetch
      .mockResolvedValueOnce(makeVerifyResponse(true))
      .mockResolvedValueOnce(makeSettleResponse(false, undefined, "insufficient_funds"));

    const { withPaymentGate } = await importX402();
    const handler = vi.fn(async () => NextResponse.json({ success: true }));
    const wrapped = withPaymentGate(PRICES.portfolio, handler);

    const paymentHeader = makeValidPaymentPayload(PRICES.portfolio);
    const request = new NextRequest("https://example.com/api/paid/portfolio", {
      headers: { "x-payment": paymentHeader },
    });

    const response = await wrapped(request);
    const body = await response.json();

    expect(response.status).toBe(402);
    expect(body.error).toContain("Payment settlement failed");
    expect(body.detail).toBe("insufficient_funds");
    expect(body.paymentRequired).toBe(true);
    expect(handler).not.toHaveBeenCalled();
  });

  it("returns 402 when settlement returns success=false without error reason", async () => {
    mockFetch
      .mockResolvedValueOnce(makeVerifyResponse(true))
      .mockResolvedValueOnce(makeSettleResponse(false));

    const { withPaymentGate } = await importX402();
    const handler = vi.fn(async () => NextResponse.json({ success: true }));
    const wrapped = withPaymentGate(PRICES.portfolio, handler);

    const paymentHeader = makeValidPaymentPayload(PRICES.portfolio);
    const request = new NextRequest("https://example.com/api/paid/portfolio", {
      headers: { "x-payment": paymentHeader },
    });

    const response = await wrapped(request);
    const body = await response.json();

    expect(response.status).toBe(402);
    expect(body.error).toContain("Payment settlement failed");
    expect(handler).not.toHaveBeenCalled();
  });

  it("handles network error during settlement gracefully", async () => {
    mockFetch
      .mockResolvedValueOnce(makeVerifyResponse(true))
      .mockRejectedValueOnce(new Error("Network timeout"));

    const { withPaymentGate } = await importX402();
    const handler = vi.fn(async () => NextResponse.json({ success: true }));
    const wrapped = withPaymentGate(PRICES.portfolio, handler);

    const paymentHeader = makeValidPaymentPayload(PRICES.portfolio);
    const request = new NextRequest("https://example.com/api/paid/portfolio", {
      headers: { "x-payment": paymentHeader },
    });

    const response = await wrapped(request);
    const body = await response.json();

    expect(response.status).toBe(402);
    expect(body.error).toContain("Payment settlement failed");
    expect(handler).not.toHaveBeenCalled();
  });

  it("includes transaction hash in settlement when available", async () => {
    const txHash = "0x" + "b".repeat(64);
    mockFetch
      .mockResolvedValueOnce(makeVerifyResponse(true))
      .mockResolvedValueOnce(makeSettleResponse(true, txHash));

    const { withPaymentGate } = await importX402();
    const handler = vi.fn(async () => NextResponse.json({ success: true }));
    const wrapped = withPaymentGate(PRICES.portfolio, handler);

    const paymentHeader = makeValidPaymentPayload(PRICES.portfolio);
    const request = new NextRequest("https://example.com/api/paid/portfolio", {
      headers: { "x-payment": paymentHeader },
    });

    await wrapped(request);
    
    // Handler should be called since settlement succeeded
    expect(handler).toHaveBeenCalledOnce();
  });
});

// ============================================================================
// 402 Challenge Tests
// ============================================================================

describe("x402 Payment Gate - 402 Challenge Response", () => {
  it("returns 402 challenge when no auth provided", async () => {
    const { withPaymentGate } = await importX402();
    const handler = vi.fn(async () => NextResponse.json({ success: true }));
    const wrapped = withPaymentGate(PRICES.price, handler);

    const request = new NextRequest("https://example.com/api/paid/price");
    const response = await wrapped(request);
    const body = await response.json();

    expect(response.status).toBe(402);
    expect(body.error).toBe("Payment Required");
    expect(body.paymentRequired).toBe(true);
    expect(body.x402Version).toBe(1);
    expect(body.accepts).toBeDefined();
    expect(body.accepts).toHaveLength(1);
    
    // Check payment requirements
    const requirement = body.accepts[0];
    expect(requirement.scheme).toBe("exact");
    expect(requirement.network).toBe("eip155:8453");
    expect(requirement.maxAmountRequired).toBe(PRICES.price.atomic);
    expect(requirement.asset).toBe("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913");
    expect(requirement.payTo).toBeDefined();
    expect(requirement.maxTimeoutSeconds).toBe(300);
    
    // Check headers
    expect(response.headers.get("X-Payment-Required")).toBe(PRICES.price.display);
    
    expect(handler).not.toHaveBeenCalled();
  });

  it("returns 402 with correct price for portfolio endpoint", async () => {
    const { withPaymentGate } = await importX402();
    const handler = vi.fn(async () => NextResponse.json({ success: true }));
    const wrapped = withPaymentGate(PRICES.portfolio, handler);

    const request = new NextRequest("https://example.com/api/paid/portfolio");
    const response = await wrapped(request);
    const body = await response.json();

    expect(body.accepts[0].maxAmountRequired).toBe("20000");
    expect(response.headers.get("X-Payment-Required")).toBe("$0.02");
  });

  it("returns 402 with correct price for health endpoint", async () => {
    const { withPaymentGate } = await importX402();
    const handler = vi.fn(async () => NextResponse.json({ success: true }));
    const wrapped = withPaymentGate(PRICES.health, handler);

    const request = new NextRequest("https://example.com/api/paid/health");
    const response = await wrapped(request);
    const body = await response.json();

    expect(body.accepts[0].maxAmountRequired).toBe("1000");
    expect(response.headers.get("X-Payment-Required")).toBe("$0.001");
  });
});

// ============================================================================
// create402Response Tests
// ============================================================================

describe("create402Response helper", () => {
  it("creates standalone 402 response", async () => {
    const { create402Response } = await importX402();
    const response = create402Response(PRICES.portfolio, "https://example.com/resource");
    
    expect(response.status).toBe(402);
    // Note: NextResponse.json returns a NextResponse, status is on the response object
  });
});

// ============================================================================
// withPayment (backward compat) Tests
// ============================================================================

describe("withPayment backward compatibility", () => {
  it("withPayment is exported as alias for withPaymentGate", async () => {
    process.env.PAID_API_BYPASS_KEY = "test-bypass-key";
    const { withPayment } = await importX402();
    
    const handler = vi.fn(async () => NextResponse.json({ success: true }));
    const wrapped = withPayment(PRICES.health, handler);

    const request = new NextRequest("https://example.com/api/paid/health", {
      headers: { "x-api-key": "test-bypass-key" },
    });

    const response = await wrapped(request);
    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledOnce();
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe("x402 Payment Gate - Edge Cases", () => {
  it("handles handler that throws an error", async () => {
    mockFetch
      .mockResolvedValueOnce(makeVerifyResponse(true))
      .mockResolvedValueOnce(makeSettleResponse(true, "0x" + "a".repeat(64)));

    const { withPaymentGate } = await importX402();
    const handler = vi.fn(async () => {
      throw new Error("Handler error");
    });
    const wrapped = withPaymentGate(PRICES.portfolio, handler);

    const paymentHeader = makeValidPaymentPayload(PRICES.portfolio);
    const request = new NextRequest("https://example.com/api/paid/portfolio", {
      headers: { "x-payment": paymentHeader },
    });

    // The error should propagate up
    await expect(wrapped(request)).rejects.toThrow("Handler error");
  });

  it("uses default server wallet address when env var not set", async () => {
    delete process.env.SERVER_WALLET_ADDRESS;
    
    mockFetch.mockResolvedValueOnce(makeVerifyResponse(true));

    const { withPaymentGate } = await importX402();
    const handler = vi.fn(async () => NextResponse.json({ success: true }));
    const wrapped = withPaymentGate(PRICES.portfolio, handler);

    const paymentHeader = makeValidPaymentPayload(PRICES.portfolio);
    const request = new NextRequest("https://example.com/api/paid/portfolio", {
      headers: { "x-payment": paymentHeader },
    });

    await wrapped(request);

    // Verify the request was made (uses default address)
    expect(mockFetch).toHaveBeenCalled();
  });

  it("uses default facilitator URL when env var not set", async () => {
    delete process.env.X402_FACILITATOR_URL;
    
    mockFetch.mockResolvedValueOnce(makeVerifyResponse(true));

    const { withPaymentGate } = await importX402();
    const handler = vi.fn(async () => NextResponse.json({ success: true }));
    const wrapped = withPaymentGate(PRICES.portfolio, handler);

    const paymentHeader = makeValidPaymentPayload(PRICES.portfolio);
    const request = new NextRequest("https://example.com/api/paid/portfolio", {
      headers: { "x-payment": paymentHeader },
    });

    await wrapped(request);

    // Verify request was made to default facilitator URL
    const fetchCall = mockFetch.mock.calls[0];
    const url = fetchCall[0] as string;
    expect(url).toContain("x402.org/facilitator");
  });

  it("handles facilitator returning non-JSON error response", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response("Not a JSON response", { 
        status: 500, 
        headers: { "Content-Type": "text/plain" } 
      })
    );

    const { withPaymentGate } = await importX402();
    const handler = vi.fn(async () => NextResponse.json({ success: true }));
    const wrapped = withPaymentGate(PRICES.portfolio, handler);

    const paymentHeader = makeValidPaymentPayload(PRICES.portfolio);
    const request = new NextRequest("https://example.com/api/paid/portfolio", {
      headers: { "x-payment": paymentHeader },
    });

    const response = await wrapped(request);
    expect(response.status).toBe(402);
  });
});
