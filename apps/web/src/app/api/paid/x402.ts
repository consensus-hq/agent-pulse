import { createThirdwebClient } from "thirdweb";
import { facilitator, settlePayment } from "thirdweb/x402";
import { base } from "thirdweb/chains";
import { NextRequest, NextResponse } from "next/server";

/**
 * x402 Payment Gate - Shared Helper for Paid API Endpoints
 * 
 * This module provides thirdweb x402 integration for payment-gated endpoints.
 * External agents pay USDC to access these endpoints.
 * 
 * Architecture:
 * - /api/defi/*     → FREE (app pays HeyElsa via hot wallet)
 * - /api/paid/*     → PAID (external agents pay us via x402)
 */

// ============================================
// THIRDWEB CLIENT SETUP (lazy — no throws at import time)
// ============================================

function getSecretKey(): string {
  const key = process.env.THIRDWEB_SECRET_KEY;
  if (!key) throw new Error("THIRDWEB_SECRET_KEY is required for x402 payments");
  return key;
}

function getServerWalletAddress(): string {
  const addr = process.env.SERVER_WALLET_ADDRESS;
  if (!addr) throw new Error("SERVER_WALLET_ADDRESS is required for x402 payments");
  return addr;
}

let _client: ReturnType<typeof createThirdwebClient> | null = null;
function getClient() {
  if (!_client) _client = createThirdwebClient({ secretKey: getSecretKey() });
  return _client;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _facilitator: any = null;
function getFacilitator() {
  if (!_facilitator) {
    _facilitator = facilitator({
      client: getClient(),
      serverWalletAddress: getServerWalletAddress(),
    });
  }
  return _facilitator;
}

// Backward-compat named exports (lazy)
export const thirdwebClient = new Proxy({} as ReturnType<typeof createThirdwebClient>, {
  get: (_target, prop) => (getClient() as Record<string | symbol, unknown>)[prop],
});

// ============================================
// PRICE CONFIGURATION
// ============================================

export const PRICES = {
  portfolio: "$0.02",
  price: "$0.005",
  health: "$0.001",
} as const;

export type PaidEndpoint = keyof typeof PRICES;

// ============================================
// PAYMENT SETTLEMENT WRAPPER
// ============================================

export interface PaymentResult {
  status: number;
  payment?: {
    payer: string;
    amount: string;
    timestamp: string;
  };
  error?: string;
}

/**
 * Settle x402 payment from request headers
 */
export async function settleX402Payment(
  request: NextRequest,
  price: string
): Promise<PaymentResult> {
  const paymentData =
    request.headers.get("x-payment") ||
    request.headers.get("X-PAYMENT") ||
    request.headers.get("PAYMENT-SIGNATURE") ||
    request.headers.get("payment-signature");

  if (!paymentData) {
    return {
      status: 402,
      error: "Payment required. Include x-payment header with x402 payment data.",
    };
  }

  try {
    const result = await settlePayment({
      resourceUrl: request.url,
      method: request.method,
      paymentData,
      payTo: getServerWalletAddress(),
      network: base,
      price,
      facilitator: getFacilitator(),
    });

    if (result.status === 200) {
      return {
        status: 200,
        payment: {
          payer: result.paymentReceipt?.payer || "unknown",
          amount: price,
          timestamp: new Date().toISOString(),
        },
      };
    }

    return {
      status: result.status,
      error: "Payment settlement failed",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return {
      status: 500,
      error: `Payment settlement error: ${message}`,
    };
  }
}

/**
 * Higher-order function wrapping a route handler with x402 payment verification
 */
export function withPayment<T>(
  price: string,
  handler: (req: NextRequest, payment: NonNullable<PaymentResult["payment"]>) => Promise<NextResponse<T>>
): (req: NextRequest) => Promise<NextResponse<T | { error: string; paymentRequired?: boolean }>> {
  return async (request: NextRequest) => {
    const paymentResult = await settleX402Payment(request, price);

    if (paymentResult.status !== 200) {
      return NextResponse.json(
        {
          error: paymentResult.error || "Payment required",
          paymentRequired: true,
        },
        {
          status: paymentResult.status,
          headers: {
            "X-Payment-Required": price,
          },
        }
      ) as NextResponse<{ error: string; paymentRequired?: boolean }>;
    }

    return handler(request, paymentResult.payment!);
  };
}

// ============================================
// 402 CHALLENGE RESPONSE
// ============================================

export function create402Response(price: string, resource: string): NextResponse {
  return NextResponse.json(
    {
      error: "Payment Required",
      accepts: [
        {
          scheme: "exact",
          network: "base",
          maxAmountRequired: price,
          resource,
          description: "USDC payment required to access this resource",
          mimeType: "application/json",
          payTo: getServerWalletAddress(),
          asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC on Base
          maxTimeoutSeconds: 300,
        },
      ],
    },
    { status: 402 }
  );
}
