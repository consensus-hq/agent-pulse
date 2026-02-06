import { NextRequest, NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import { createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";

/**
 * HeyElsa x402 Server-Side Proxy
 * 
 * Architecture:
 * - APP pays HeyElsa using a dedicated hot wallet (server-side)
 * - Zero wallet popups for users
 * - KV cache for 60 seconds to minimize payments
 * 
 * Security:
 * - HEYELSA_PAYMENT_KEY is server-side only (no NEXT_PUBLIC_ prefix)
 * - Max payment guard: rejects 402 asking for > $0.10 per call
 * - Logs payment amounts for monitoring
 * 
 * Endpoints (VERA-003):
 * - portfolio: POST /api/get_portfolio ($0.01)
 * - balances: POST /api/get_balances ($0.005)
 * - token_price: POST /api/get_token_price ($0.002)
 */

// USDC on Base mainnet
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

// HeyElsa API base URL
const HEYELSA_BASE_URL = "https://x402-api.heyelsa.ai";

// Security limits
const MAX_PAYMENT_PER_CALL = 50000n; // $0.05 USDC (6 decimals)
const CACHE_TTL_SECONDS = 60;

// EIP-3009 TransferWithAuthorization types
const TRANSFER_WITH_AUTHORIZATION_TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

// EIP-712 Domain for USDC on Base
const getUSDCDomain = () => ({
  name: "USD Coin",
  version: "2",
  chainId: 8453,
  verifyingContract: USDC_BASE as `0x${string}`,
});

// Valid actions and their endpoint mappings
const VALID_ACTIONS: Record<string, { endpoint: string; cost: string }> = {
  portfolio: { endpoint: "/api/get_portfolio", cost: "$0.01" },
  balances: { endpoint: "/api/get_balances", cost: "$0.005" },
  token_price: { endpoint: "/api/get_token_price", cost: "$0.002" },
};

/**
 * Create wallet client from private key
 */
function getPaymentWallet() {
  const privateKey = process.env.HEYELSA_PAYMENT_KEY;
  
  if (!privateKey) {
    throw new Error("HEYELSA_PAYMENT_KEY not configured");
  }

  // Ensure key has 0x prefix
  const formattedKey = privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;
  
  const account = privateKeyToAccount(formattedKey as Hex);
  
  return createWalletClient({
    account,
    chain: base,
    transport: http(),
  });
}

/**
 * Parse 402 response to get payment requirements
 */
interface PaymentRequirements {
  scheme: string;
  network: string;
  maxAmountRequired: string;
  resource: string;
  description: string;
  mimeType: string;
  paymentRequirements: Array<{
    scheme: string;
    network: string;
    requiredAmount: string;
    asset: string;
    payTo: string;
    maxTimeoutSeconds: number;
    extra?: Record<string, unknown>;
  }>;
}

async function parse402Response(response: Response): Promise<PaymentRequirements> {
  const body = await response.json();
  
  // Handle different response formats
  if (body.paymentRequirements) {
    return body as PaymentRequirements;
  }
  
  // Alternative format from some x402 implementations
  return {
    scheme: body.scheme || "exact",
    network: body.network || "eip155:8453",
    maxAmountRequired: body.amount || body.maxAmountRequired || "0",
    resource: body.resource || "",
    description: body.description || "",
    mimeType: body.mimeType || "application/json",
    paymentRequirements: body.paymentRequirements || [{
      scheme: body.scheme || "exact",
      network: body.network || "eip155:8453",
      requiredAmount: body.amount || "10000",
      asset: body.asset || USDC_BASE,
      payTo: body.payTo || body.recipient || "",
      maxTimeoutSeconds: body.maxTimeoutSeconds || 300,
    }],
  };
}

/**
 * Create EIP-3009 payment signature
 */
async function createPaymentSignature(
  wallet: ReturnType<typeof getPaymentWallet>,
  paymentReq: PaymentRequirements["paymentRequirements"][0]
): Promise<string> {
  const amount = BigInt(paymentReq.requiredAmount);
  
  // Security guard: reject if amount exceeds max
  if (amount > MAX_PAYMENT_PER_CALL) {
    throw new Error(
      `Payment amount ${amount} exceeds max allowed ${MAX_PAYMENT_PER_CALL} ($0.05 USDC)`
    );
  }

  // Generate nonce (random 32 bytes)
  const nonce = `0x${Buffer.from(crypto.randomUUID().replace(/-/g, ""), "hex").toString("hex")}` as Hex;
  
  const now = Math.floor(Date.now() / 1000);
  const validAfter = 0n;
  const validBefore = BigInt(now + (paymentReq.maxTimeoutSeconds || 300));

  const message = {
    from: wallet.account.address,
    to: paymentReq.payTo as `0x${string}`,
    value: amount,
    validAfter,
    validBefore,
    nonce,
  };

  // Sign EIP-712 typed data
  const signature = await wallet.signTypedData({
    domain: getUSDCDomain(),
    types: TRANSFER_WITH_AUTHORIZATION_TYPES,
    primaryType: "TransferWithAuthorization",
    message,
  });

  // Build X-PAYMENT payload (base64 encoded JSON)
  const payload = {
    x402Version: 1,
    scheme: paymentReq.scheme,
    network: paymentReq.network,
    payload: {
      token: paymentReq.asset,
      to: paymentReq.payTo,
      amount: paymentReq.requiredAmount,
      authorization: {
        from: wallet.account.address,
        to: paymentReq.payTo,
        value: paymentReq.requiredAmount,
        validAfter: validAfter.toString(),
        validBefore: validBefore.toString(),
        nonce,
        signature,
        version: "2",
        chainId: 8453,
        verifyingContract: USDC_BASE,
      },
    },
  };

  return btoa(JSON.stringify(payload));
}

/**
 * Make request to HeyElsa with automatic 402 handling
 */
async function fetchWithPayment(
  endpoint: string,
  body: Record<string, unknown>
): Promise<Response> {
  const wallet = getPaymentWallet();
  const url = `${HEYELSA_BASE_URL}${endpoint}`;

  // First attempt
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify(body),
  });

  // If not 402, return as-is
  if (response.status !== 402) {
    return response;
  }

  // Parse 402 response
  const paymentReq = await parse402Response(response);
  
  // Get first payment requirement (should be USDC on Base)
  const requirement = paymentReq.paymentRequirements?.[0];
  
  if (!requirement) {
    throw new Error("No payment requirements in 402 response");
  }

  // Log payment for monitoring
  console.log(`[HeyElsa x402] Payment required:`, {
    endpoint,
    amount: requirement.requiredAmount,
    asset: requirement.asset,
    payer: wallet.account.address,
  });

  // Create payment signature
  const paymentHeader = await createPaymentSignature(wallet, requirement);

  // Retry with payment header
  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "X-PAYMENT": paymentHeader,
    },
    body: JSON.stringify(body),
  });
}

/**
 * Validate Ethereum address
 */
function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * GET /api/defi?action=portfolio|balances|token_price&address=0x...
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action");
    const address = searchParams.get("address");
    const tokenAddress = searchParams.get("token"); // For token_price action

    // Validate parameters
    if (!action) {
      return NextResponse.json(
        { error: "Missing required parameter: action" },
        { status: 400 }
      );
    }

    if (!address || !isValidAddress(address)) {
      return NextResponse.json(
        { error: "Missing or invalid parameter: address (must be 0x... Ethereum address)" },
        { status: 400 }
      );
    }

    // Validate action
    const actionConfig = VALID_ACTIONS[action];
    if (!actionConfig) {
      return NextResponse.json(
        { 
          error: "Invalid action", 
          validActions: Object.keys(VALID_ACTIONS) 
        },
        { status: 400 }
      );
    }

    // Check KV cache first (include token for token_price to avoid cross-token cache hits)
    const cacheKey = action === "token_price" 
      ? `defi:${action}:${(tokenAddress || address).toLowerCase()}`
      : `defi:${action}:${address.toLowerCase()}`;
    const cached = await kv.get<Record<string, unknown>>(cacheKey);
    
    if (cached) {
      console.log(`[HeyElsa x402] Cache hit for ${action}:${address}`);
      return NextResponse.json({
        ...cached,
        _cached: true,
        _cachedAt: new Date().toISOString(),
      });
    }

    // Build request body based on action
    const requestBody: Record<string, unknown> = {};

    // token_price uses token_address+chain, not wallet_address (VERA-003)
    if (action === "token_price") {
      if (!tokenAddress || !isValidAddress(tokenAddress)) {
        return NextResponse.json(
          { error: "Missing or invalid parameter: token (token address required for token_price)" },
          { status: 400 }
        );
      }
      requestBody.token_address = tokenAddress;
      requestBody.chain = "base";
    } else {
      requestBody.wallet_address = address;
    }

    // Fetch from HeyElsa with payment
    console.log(`[HeyElsa x402] Fetching ${action} for ${address}`);
    
    const response = await fetchWithPayment(actionConfig.endpoint, requestBody);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[HeyElsa x402] API error: ${response.status}`, errorText);
      
      return NextResponse.json(
        { 
          error: "HeyElsa API error", 
          status: response.status,
          message: errorText 
        },
        { status: 503 }
      );
    }

    const data = await response.json();

    // Cache successful response
    await kv.set(cacheKey, data, { ex: CACHE_TTL_SECONDS });
    console.log(`[HeyElsa x402] Cached ${action} for ${address} (TTL: ${CACHE_TTL_SECONDS}s)`);

    return NextResponse.json({
      ...data,
      _cached: false,
      _fetchedAt: new Date().toISOString(),
    });

  } catch (error) {
    console.error("[HeyElsa x402] Error:", error);
    
    const message = error instanceof Error ? error.message : "Unknown error";
    
    // Specific error for payment key issues
    if (message.includes("HEYELSA_PAYMENT_KEY")) {
      return NextResponse.json(
        { error: "Server configuration error: Payment wallet not configured" },
        { status: 503 }
      );
    }

    // Specific error for payment too high
    if (message.includes("exceeds max allowed")) {
      return NextResponse.json(
        { error: "Payment rejected: Amount exceeds safety limit ($0.05 max)" },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { error: "Failed to fetch DeFi data", message },
      { status: 503 }
    );
  }
}

/**
 * Health check endpoint
 */
export async function HEAD() {
  return new NextResponse(null, { status: 200 });
}
