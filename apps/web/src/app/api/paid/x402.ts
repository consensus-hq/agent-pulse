import { NextRequest, NextResponse } from "next/server";

/**
 * x402 Payment Gate - Shared Helper for Paid API Endpoints
 * 
 * Returns proper 402 challenges. Settlement TBD post-hackathon
 * when thirdweb ships their x402 module.
 */

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
// PAYMENT RESULT TYPE
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

// Default to Treasury Safe multisig for payment collection
const SERVER_WALLET_ADDRESS = process.env.SERVER_WALLET_ADDRESS || "0xA7940a42c30A7F492Ed578F3aC728c2929103E43";

// ============================================
// PAYMENT SETTLEMENT
// ============================================

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

  // TODO: Integrate thirdweb x402 settlement when available
  // For now, return 402 — settlement not yet wired
  return {
    status: 402,
    error: "x402 payment settlement not yet available. Payment data received but cannot be verified.",
  };
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
          accepts: [
            {
              scheme: "exact",
              network: "base",
              maxAmountRequired: price,
              resource: request.url,
              description: "USDC payment required to access this resource",
              mimeType: "application/json",
              payTo: SERVER_WALLET_ADDRESS,
              asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC on Base
              maxTimeoutSeconds: 300,
            },
          ],
        },
        {
          status: 402,
          headers: {
            "X-Payment-Required": price,
          },
        }
      ) as NextResponse<{ error: string; paymentRequired?: boolean }>;
    }

    return handler(request, paymentResult.payment!);
  };
}

/**
 * Generate a 402 Payment Required response with x402 requirements
 */
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
          payTo: SERVER_WALLET_ADDRESS,
          asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
          maxTimeoutSeconds: 300,
        },
      ],
    },
    { status: 402 }
  );
}
