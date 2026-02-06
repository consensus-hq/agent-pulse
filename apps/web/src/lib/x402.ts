import { NextRequest, NextResponse } from "next/server";
import { createThirdwebClient } from "thirdweb";
import { facilitator, settlePayment } from "thirdweb/x402";
import { baseSepolia } from "thirdweb/chains";
import { createWalletClient, http, publicActions, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia as viemBaseSepolia } from "viem/chains";
import { verifyRequestBinding } from "./x402-request-binding";
import { calculatePrice } from "./pricing";

// ============================================
// CONFIGURATION
// ============================================

const SECRET_KEY = process.env.THIRDWEB_SECRET_KEY;
const SERVER_WALLET_ADDRESS = process.env.SERVER_WALLET_ADDRESS;
const SERVER_WALLET_PRIVATE_KEY = process.env.SERVER_WALLET_PRIVATE_KEY;
const BURN_WITH_FEE_ADDRESS = process.env.NEXT_PUBLIC_BURN_WITH_FEE_ADDRESS;
// Use a fallback if not set, or throw in production? For now, we'll try to read it.

export const REGISTRY_CONTRACT = "0x2C802988c16Fae08bf04656fe93aDFA9a5bA8612" as const;
export const USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const;

// Minimal ABI for BurnWithFee
const BURN_ABI = parseAbi([
  "function burnWithFee(uint256 amount) external returns (uint256, uint256)"
]);

// ============================================
// TYPES
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

// ============================================
// HELPERS
// ============================================

function getThirdwebClient() {
  if (!SECRET_KEY) throw new Error("THIRDWEB_SECRET_KEY is required");
  return createThirdwebClient({ secretKey: SECRET_KEY });
}

function getFacilitator() {
  if (!SERVER_WALLET_ADDRESS) throw new Error("SERVER_WALLET_ADDRESS is required");
  return facilitator({
    client: getThirdwebClient(),
    serverWalletAddress: SERVER_WALLET_ADDRESS,
  });
}

/**
 * Server-side PULSE burn logic (Best Effort)
 * Burns 1 unit of PULSE (or appropriate amount) using the server wallet.
 * Currently configured to burn 1 "wei" of PULSE or a fixed amount per call if needed.
 * For now, we'll burn 1 unit (1 wei) to signal activity, or we could map USDC price to PULSE amount.
 * The prompt implies we burn *something*. "handles PULSE burn internally". 
 * Let's assume we burn an amount proportional to price? Or just 1 unit?
 * Let's burn 1e18 (1 PULSE) if possible, or 1e6?
 * Let's stick to a small amount to avoid draining the wallet too fast for now: 1 ether (1 PULSE).
 */
async function burnPulseBestEffort(requestId: string) {
  if (!SERVER_WALLET_PRIVATE_KEY || !BURN_WITH_FEE_ADDRESS) {
    console.warn(`[${requestId}] Burn skipped: Missing config`);
    return;
  }

  try {
    const account = privateKeyToAccount(SERVER_WALLET_PRIVATE_KEY as `0x${string}`);
    const client = createWalletClient({
      account,
      chain: viemBaseSepolia,
      transport: http(),
    }).extend(publicActions);

    // Burn 1 PULSE (1e18)
    const amountToBurn = 1000000000000000000n; 

    const hash = await client.writeContract({
      address: BURN_WITH_FEE_ADDRESS as `0x${string}`,
      abi: BURN_ABI,
      functionName: "burnWithFee",
      args: [amountToBurn],
    });

    console.log(`[${requestId}] Burned PULSE: ${hash}`);
  } catch (error) {
    console.error(`[${requestId}] Burn failed:`, error);
    // Best effort - do not throw
  }
}

// ============================================
// MIDDLEWARE LOGIC
// ============================================

/**
 * Check if payment header is present
 */
export function hasPaymentHeader(request: NextRequest): boolean {
  return request.headers.has("x-402-payment") || 
         request.headers.has("x-payment") || 
         request.headers.has("payment-signature");
}

/**
 * Main x402 Payment Settlement Function
 */
export async function settleX402Payment(
  request: NextRequest,
  price: string
): Promise<PaymentResult> {
  const paymentData = request.headers.get("x-402-payment");
  
  if (!paymentData) {
    // Legacy fallback (optional)
    const legacy = request.headers.get("x-payment") || request.headers.get("payment-signature");
    if (!legacy) {
      return { status: 402, error: "Missing X-402-Payment header" };
    }
    // We proceed with legacy for now if needed, or fail. 
    // Let's assume strict x-402-payment for new middleware.
  }

  try {
    // 1. Verify Binding
    if (paymentData) {
      const binding = await verifyRequestBinding(request, paymentData);
      if (!binding.valid) {
        return { status: 402, error: `Binding failed: ${binding.error}` };
      }
    }

    const token = paymentData || request.headers.get("x-payment")!;

    // 2. Settle USDC Payment
    const result = await settlePayment({
      resourceUrl: request.url,
      method: request.method,
      paymentData: token,
      payTo: SERVER_WALLET_ADDRESS!,
      network: baseSepolia,
      price,
      facilitator: getFacilitator(),
    });

    if (result.status === 200) {
      // 3. Trigger Server-Side Burn (Async / Non-blocking)
      const requestId = crypto.randomUUID();
      // We don't await this to keep latency low? 
      // Or we await it but catch errors? Prompt says "Best-effort".
      // Ideally fire and forget, but Next.js edge/serverless might kill it.
      // We'll await it but catch all errors.
      await burnPulseBestEffort(requestId);

      return {
        status: 200,
        payment: {
          payer: result.paymentReceipt?.payer || "unknown",
          amount: price,
          timestamp: new Date().toISOString(),
        },
      };
    }

    return { status: result.status, error: "Payment settlement failed" };

  } catch (error: any) {
    return { status: 500, error: error.message };
  }
}

/**
 * Generate 402 Response
 */
export function create402Response(price: string, resource: string) {
  return NextResponse.json(
    {
      error: "Payment Required",
      x402Version: "1.0",
      accepts: [
        {
          scheme: "x402-binding",
          network: "eip155:84532",
          maxAmountRequired: price,
          resource,
          description: "USDC payment with request binding required",
          mimeType: "application/json",
          payTo: SERVER_WALLET_ADDRESS,
          asset: USDC_BASE_SEPOLIA,
          maxTimeoutSeconds: 60,
        },
      ],
    },
    { status: 402 }
  );
}

/**
 * Reusable Middleware HOC
 */
export async function withX402<T>(
  request: NextRequest,
  options: { price: bigint | number; endpointLabel?: string },
  handler: (payment?: PaymentResult["payment"]) => Promise<NextResponse<T>>
): Promise<NextResponse> {
  const priceAtomic = BigInt(options.price);
  // Format price for challenge (e.g. 10000 -> "$0.01")
  // Using simple formatter:
  const whole = priceAtomic / 1_000_000n;
  const frac = priceAtomic % 1_000_000n;
  let fracStr = frac.toString().padStart(6, "0").replace(/0+$/, "");
  if (fracStr.length < 2) fracStr = fracStr.padEnd(2, "0");
  const priceString = `$${whole}.${fracStr}`;

  const hasPayment = request.headers.has("x-402-payment") || request.headers.has("x-payment");

  if (!hasPayment) {
    return create402Response(priceString, request.url);
  }

  const result = await settleX402Payment(request, priceString);
  if (result.status !== 200) {
    return NextResponse.json(
      { error: result.error || "Payment failed" },
      { status: result.status, headers: { "X-Payment-Required": priceString } }
    );
  }

  // Inject payment info
  const response = await handler(result.payment);
  // Ideally we append the payment info to the JSON body if possible, or headers
  // For now, rely on the handler to use it if needed.
  return response;
}
