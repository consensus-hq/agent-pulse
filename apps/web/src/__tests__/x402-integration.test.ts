import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { decodePaymentRequiredHeader, encodePaymentSignatureHeader } from "@x402/core/http";

const makeSupportedResponse = () =>
  new Response(
    JSON.stringify({
      kinds: [
        {
          x402Version: 2,
          scheme: "exact",
          network: "eip155:84532",
        },
      ],
      extensions: [],
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );

const makeVerifyResponse = (isValid: boolean) =>
  new Response(
    JSON.stringify({
      isValid,
      invalidReason: isValid ? undefined : "invalid_payment",
      payer: "0x" + "1".repeat(40),
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );

const makeSettleResponse = () =>
  new Response(
    JSON.stringify({
      success: true,
      transaction: "0x" + "2".repeat(64),
      network: "eip155:84532",
      payer: "0x" + "1".repeat(40),
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );

const buildPaymentHeader = (paymentRequiredHeader: string) => {
  const paymentRequired = decodePaymentRequiredHeader(paymentRequiredHeader);
  const requirement = paymentRequired.accepts[0];
  const paymentPayload = {
    x402Version: paymentRequired.x402Version,
    resource: paymentRequired.resource,
    accepted: requirement,
    payload: {
      authorization: {
        from: "0x" + "1".repeat(40),
        to: requirement.payTo,
        value: requirement.amount,
        validAfter: "0",
        validBefore: "0",
        nonce: "0x" + "0".repeat(64),
      },
      signature: "0x" + "3".repeat(130),
    },
  };

  return encodePaymentSignatureHeader(paymentPayload);
};

describe("x402 pulse integration", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.NEXT_PUBLIC_CHAIN_ID = "84532";
    process.env.NEXT_PUBLIC_PULSE_TOKEN_ADDRESS = "0x" + "a".repeat(40);
    process.env.SIGNAL_SINK_ADDRESS = "0x" + "b".repeat(40);
    process.env.PULSE_TOKEN_NAME = "Pulse";
    process.env.PULSE_TOKEN_VERSION = "1";
    process.env.X402_FACILITATOR_URL = "https://facilitator.test";
    process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID = "test-client";
    process.env.THIRDWEB_SECRET_KEY = "";
  });

  it("returns 402 when no payment header is provided", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/supported")) {
        return makeSupportedResponse();
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }));

    const { POST } = await import("../app/api/pulse/route");
    const request = new NextRequest("https://example.com/api/pulse", {
      method: "POST",
      body: JSON.stringify({ agent: "0x" + "1".repeat(40) }),
    });

    const response = await POST(request as never);

    expect(response.status).toBe(402);
    expect(response.headers.get("PAYMENT-REQUIRED")).toBeTruthy();
  });

  it("accepts a valid payment signature", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/supported")) {
        return makeSupportedResponse();
      }
      if (url.endsWith("/verify")) {
        return makeVerifyResponse(true);
      }
      if (url.endsWith("/settle")) {
        return makeSettleResponse();
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }));

    const { POST } = await import("../app/api/pulse/route");
    const initialRequest = new NextRequest("https://example.com/api/pulse", {
      method: "POST",
      body: JSON.stringify({ agent: "0x" + "1".repeat(40) }),
    });

    const paymentRequiredResponse = await POST(initialRequest as never);
    const paymentRequiredHeader = paymentRequiredResponse.headers.get("PAYMENT-REQUIRED");
    expect(paymentRequiredHeader).toBeTruthy();

    const paymentHeader = buildPaymentHeader(paymentRequiredHeader!);

    const paidRequest = new NextRequest("https://example.com/api/pulse", {
      method: "POST",
      body: JSON.stringify({ agent: "0x" + "1".repeat(40) }),
      headers: { "PAYMENT-SIGNATURE": paymentHeader },
    });

    const paidResponse = await POST(paidRequest as never);
    const body = (await paidResponse.json()) as { success: boolean };

    expect(paidResponse.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it("rejects invalid payments", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/supported")) {
        return makeSupportedResponse();
      }
      if (url.endsWith("/verify")) {
        return makeVerifyResponse(false);
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }));

    const { POST } = await import("../app/api/pulse/route");
    const initialRequest = new NextRequest("https://example.com/api/pulse", {
      method: "POST",
      body: JSON.stringify({ agent: "0x" + "1".repeat(40) }),
    });

    const paymentRequiredResponse = await POST(initialRequest as never);
    const paymentRequiredHeader = paymentRequiredResponse.headers.get("PAYMENT-REQUIRED");
    expect(paymentRequiredHeader).toBeTruthy();

    const paymentHeader = buildPaymentHeader(paymentRequiredHeader!);

    const paidRequest = new NextRequest("https://example.com/api/pulse", {
      method: "POST",
      body: JSON.stringify({ agent: "0x" + "1".repeat(40) }),
      headers: { "PAYMENT-SIGNATURE": paymentHeader },
    });

    const paidResponse = await POST(paidRequest as never);

    expect(paidResponse.status).toBe(402);
  });
});
