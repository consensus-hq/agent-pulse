import { NextRequest, NextResponse } from "next/server";

/**
 * x402 Payment Gate - Shared Helper for Paid API Endpoints
 *
 * Supports three access modes:
 * 1. Bypass: X-API-KEY header matching PAID_API_BYPASS_KEY env var (dev/demo)
 * 2. x402 Payment: X-PAYMENT header verified via the x402 facilitator
 * 3. 402 Challenge: returned when no valid auth is provided
 *
 * The x402 verification delegates to the facilitator at X402_FACILITATOR_URL.
 * Settlement occurs after the handler returns a successful response.
 */

// ============================================
// CONFIGURATION
// ============================================

/** USDC on Base mainnet */
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;

/** Base mainnet network identifier for x402 */
const NETWORK = "eip155:8453" as const;

/** Default to Treasury Safe multisig for payment collection */
const SERVER_WALLET_ADDRESS =
  process.env.SERVER_WALLET_ADDRESS || "0xA7940a42c30A7F492Ed578F3aC728c2929103E43";

/** x402 facilitator URL for payment verification & settlement */
const USE_THIRDWEB = process.env.USE_THIRDWEB_FACILITATOR === "true";
const FACILITATOR_URL =
  process.env.X402_FACILITATOR_URL ||
  (USE_THIRDWEB ? "https://api.thirdweb.com/v1/payments/x402" : "https://x402.org/facilitator");

/** Bypass key for development / hackathon demo access */
const BYPASS_KEY = process.env.PAID_API_BYPASS_KEY;

// ============================================
// PRICE CONFIGURATION
// ============================================

export interface PriceConfig {
  /** Human-readable display price (e.g. "$0.02") */
  display: string;
  /** Atomic USDC amount (6 decimals) as string */
  atomic: string;
}

export const PRICES: Record<string, PriceConfig> = {
  portfolio: { display: "$0.02", atomic: "20000" },
  price: { display: "$0.005", atomic: "5000" },
  health: { display: "$0.001", atomic: "1000" },
} as const;

export type PaidEndpoint = keyof typeof PRICES;

// ============================================
// PAYMENT INFO TYPE
// ============================================

export interface PaymentInfo {
  /** Address of the payer (or "bypass" for API key access) */
  payer: string;
  /** Atomic amount paid (or "0" for bypass) */
  amount: string;
  /** ISO timestamp of the payment */
  timestamp: string;
  /** How access was granted */
  method: "x402" | "bypass";
}

// ============================================
// x402 FACILITATOR VERIFICATION
// ============================================

interface ParsedPaymentPayload {
  x402Version: number;
  scheme: string;
  network: string;
  payload: {
    signature: string;
    authorization: {
      from: string;
      to: string;
      value: string;
      validAfter: string;
      validBefore: string;
      nonce: string;
    };
  };
}

/**
 * Decode the base64-encoded X-PAYMENT header into a structured payload.
 */
function decodePaymentHeader(header: string): ParsedPaymentPayload | null {
  try {
    const json = Buffer.from(header, "base64").toString("utf-8");
    return JSON.parse(json) as ParsedPaymentPayload;
  } catch {
    return null;
  }
}

/**
 * Verify a payment payload with the x402 facilitator.
 *
 * Returns the payer address if verification succeeds, or null if it fails.
 */
async function verifyWithFacilitator(
  paymentPayload: ParsedPaymentPayload,
  price: PriceConfig,
  resource: string,
): Promise<{ success: boolean; payer: string; error?: string }> {
  const paymentRequirements = {
    scheme: "exact",
    network: NETWORK,
    maxAmountRequired: price.atomic,
    resource,
    description: "USDC payment required to access this resource",
    mimeType: "application/json",
    payTo: SERVER_WALLET_ADDRESS,
    maxTimeoutSeconds: 300,
    asset: USDC_BASE,
    extra: { name: "USD Coin", version: "2" },
    outputSchema: {},
  };

  // Build auth headers for the facilitator
  const authHeaders: Record<string, string> = {};
  const thirdwebSecret = process.env.THIRDWEB_SECRET_KEY;
  const thirdwebClientId = process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID;
  if (thirdwebSecret) {
    authHeaders["x-secret-key"] = thirdwebSecret;
  } else if (thirdwebClientId) {
    authHeaders["x-client-id"] = thirdwebClientId;
  }

  try {
    const verifyResponse = await fetch(`${FACILITATOR_URL}/verify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
      },
      body: JSON.stringify({
        paymentPayload,
        paymentRequirements,
      }),
    });

    if (!verifyResponse.ok) {
      const errText = await verifyResponse.text().catch(() => "Unknown error");
      console.error(`[x402] Facilitator verify error ${verifyResponse.status}:`, errText);
      return {
        success: false,
        payer: paymentPayload.payload.authorization.from,
        error: `Facilitator verification failed: ${verifyResponse.status}`,
      };
    }

    const result = (await verifyResponse.json()) as { isValid?: boolean; invalidReason?: string };

    if (!result.isValid) {
      return {
        success: false,
        payer: paymentPayload.payload.authorization.from,
        error: result.invalidReason || "Payment verification failed",
      };
    }

    return {
      success: true,
      payer: paymentPayload.payload.authorization.from,
    };
  } catch (err) {
    console.error("[x402] Facilitator verify exception:", err);
    return {
      success: false,
      payer: paymentPayload.payload.authorization.from,
      error: err instanceof Error ? err.message : "Verification request failed",
    };
  }
}

/**
 * Settle a verified payment via the x402 facilitator (post-handler).
 */
async function settleWithFacilitator(
  paymentPayload: ParsedPaymentPayload,
  price: PriceConfig,
  resource: string,
): Promise<{ success: boolean; transaction?: string; error?: string }> {
  const paymentRequirements = {
    scheme: "exact",
    network: NETWORK,
    maxAmountRequired: price.atomic,
    resource,
    description: "USDC payment required to access this resource",
    mimeType: "application/json",
    payTo: SERVER_WALLET_ADDRESS,
    maxTimeoutSeconds: 300,
    asset: USDC_BASE,
    extra: { name: "USD Coin", version: "2" },
    outputSchema: {},
  };

  const authHeaders: Record<string, string> = {};
  const thirdwebSecret = process.env.THIRDWEB_SECRET_KEY;
  const thirdwebClientId = process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID;
  if (thirdwebSecret) {
    authHeaders["x-secret-key"] = thirdwebSecret;
  } else if (thirdwebClientId) {
    authHeaders["x-client-id"] = thirdwebClientId;
  }

  try {
    const settleResponse = await fetch(`${FACILITATOR_URL}/settle`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
      },
      body: JSON.stringify({
        paymentPayload,
        paymentRequirements,
      }),
    });

    if (!settleResponse.ok) {
      const errText = await settleResponse.text().catch(() => "Unknown error");
      console.error(`[x402] Facilitator settle error ${settleResponse.status}:`, errText);
      return { success: false, error: `Settlement failed: ${settleResponse.status}` };
    }

    const result = (await settleResponse.json()) as {
      success?: boolean;
      transaction?: string;
      errorReason?: string;
    };

    return {
      success: result.success ?? false,
      transaction: result.transaction,
      error: result.errorReason,
    };
  } catch (err) {
    console.error("[x402] Facilitator settle exception:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Settlement request failed",
    };
  }
}

// ============================================
// MAIN PAYMENT GATE WRAPPER
// ============================================

type ErrorBody = { error: string; paymentRequired?: boolean; accepts?: unknown[] };

/**
 * Higher-order function wrapping a route handler with x402 payment verification.
 *
 * Access is granted when ANY of the following is true:
 * 1. `X-API-KEY` header matches `PAID_API_BYPASS_KEY` env var
 * 2. `X-PAYMENT` header contains a valid x402 payment verified by the facilitator
 *
 * Otherwise a 402 Payment Required challenge is returned.
 */
export function withPaymentGate<T>(
  price: PriceConfig,
  handler: (req: NextRequest, payment: PaymentInfo) => Promise<NextResponse>,
): (req: NextRequest) => Promise<NextResponse> {
  return async (request: NextRequest) => {
    // ── 1. Bypass via API key ──────────────────────────────────
    const apiKey =
      request.headers.get("x-api-key") || request.headers.get("X-API-KEY");

    if (BYPASS_KEY && apiKey && apiKey === BYPASS_KEY) {
      console.log(`[x402] Bypass access granted via API key`);
      return handler(request, {
        payer: "bypass",
        amount: "0",
        timestamp: new Date().toISOString(),
        method: "bypass",
      });
    }

    // ── 2. x402 payment verification ───────────────────────────
    const paymentHeader =
      request.headers.get("x-payment") ||
      request.headers.get("X-PAYMENT") ||
      request.headers.get("payment-signature") ||
      request.headers.get("PAYMENT-SIGNATURE");

    if (paymentHeader) {
      const parsed = decodePaymentHeader(paymentHeader);

      if (!parsed) {
        return NextResponse.json(
          { error: "Invalid X-PAYMENT header: could not decode base64 payload" },
          { status: 400 },
        );
      }

      // Verify with facilitator
      const verification = await verifyWithFacilitator(parsed, price, request.url);

      if (!verification.success) {
        return NextResponse.json(
          {
            error: verification.error || "Payment verification failed",
            paymentRequired: true,
          },
          { status: 402 },
        );
      }

      // Payment verified — settle BEFORE returning data
      const settlement = await settleWithFacilitator(parsed, price, request.url);

      if (!settlement.success) {
        console.error("[x402] Settlement failed:", settlement.error);
        return NextResponse.json(
          {
            error: "Payment settlement failed — funds were not collected",
            detail: settlement.error,
            paymentRequired: true,
          },
          { status: 402 },
        );
      }

      const payment: PaymentInfo = {
        payer: verification.payer,
        amount: price.atomic,
        timestamp: new Date().toISOString(),
        method: "x402",
      };

      return handler(request, payment);
    }

    // ── 3. No auth provided → 402 challenge ────────────────────
    return NextResponse.json(
      {
        x402Version: 1,
        error: "Payment Required",
        paymentRequired: true,
        accepts: [
          {
            scheme: "exact",
            network: NETWORK,
            maxAmountRequired: price.atomic,
            resource: request.url,
            description: `USDC payment required (${price.display})`,
            mimeType: "application/json",
            payTo: SERVER_WALLET_ADDRESS,
            maxTimeoutSeconds: 300,
            asset: USDC_BASE,
            extra: { name: "USD Coin", version: "2" },
          },
        ],
      },
      {
        status: 402,
        headers: {
          "X-Payment-Required": price.display,
        },
      },
    ) as NextResponse;
  };
}

// ============================================
// BACKWARD COMPAT: withPayment alias
// ============================================

/**
 * @deprecated Use `withPaymentGate` instead. Kept for backward compatibility.
 */
export const withPayment = withPaymentGate;

/**
 * Generate a standalone 402 Payment Required response.
 */
export function create402Response(price: PriceConfig, resource: string): NextResponse {
  return NextResponse.json(
    {
      x402Version: 1,
      error: "Payment Required",
      accepts: [
        {
          scheme: "exact",
          network: NETWORK,
          maxAmountRequired: price.atomic,
          resource,
          description: `USDC payment required (${price.display})`,
          mimeType: "application/json",
          payTo: SERVER_WALLET_ADDRESS,
          maxTimeoutSeconds: 300,
          asset: USDC_BASE,
          extra: { name: "USD Coin", version: "2" },
        },
      ],
    },
    { status: 402 },
  );
}
