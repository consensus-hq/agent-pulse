export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import {
  createPublicClient,
  createWalletClient,
  http,
  isAddress,
  parseAbi,
  formatUnits,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { kv } from "@vercel/kv";

// ============================================
// CONSTANTS
// ============================================

const PULSE_TOKEN_ADDRESS = "0x21111B39A502335aC7e45c4574Dd083A69258b07" as const;
const FAUCET_AMOUNT = 10_000n * 10n ** 18n; // 10,000 PULSE
const FAUCET_AMOUNT_DISPLAY = "10000";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

// Rate-limit: max 50 claims per hour globally
const GLOBAL_RATE_LIMIT = 50;
const GLOBAL_RATE_WINDOW_SECONDS = 3600; // 1 hour

// KV keys
const KV_CLAIMS_PREFIX = "faucet:claimed:";
const KV_TOTAL_CLAIMS = "faucet:total_claims";
const KV_GLOBAL_WINDOW = "faucet:global_window";

// Minimal ERC-20 ABI for transfer + balanceOf
const ERC20_ABI = parseAbi([
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
]);

// ============================================
// CLIENTS (lazy-initialized)
// ============================================

function getRpcUrl(): string {
  return process.env.BASE_RPC_URL || "https://mainnet.base.org";
}

function getPublicClient() {
  return createPublicClient({
    chain: base,
    transport: http(getRpcUrl()),
  });
}

function getWalletClient() {
  const pk = process.env.DEPLOYER_PRIVATE_KEY;
  if (!pk) throw new Error("DEPLOYER_PRIVATE_KEY not configured");

  const account = privateKeyToAccount(
    (pk.startsWith("0x") ? pk : `0x${pk}`) as Hex,
  );

  return { walletClient: createWalletClient({
    account,
    chain: base,
    transport: http(getRpcUrl()),
  }), account };
}

// ============================================
// HELPERS
// ============================================

function jsonError(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status });
}

async function hasAlreadyClaimed(address: string): Promise<boolean> {
  const key = `${KV_CLAIMS_PREFIX}${address.toLowerCase()}`;
  const claimed = await kv.get(key);
  return claimed !== null;
}

async function markClaimed(address: string): Promise<void> {
  const key = `${KV_CLAIMS_PREFIX}${address.toLowerCase()}`;
  await kv.set(key, Date.now());
}

async function checkGlobalRateLimit(): Promise<boolean> {
  const count = await kv.get<number>(KV_GLOBAL_WINDOW);
  return (count ?? 0) < GLOBAL_RATE_LIMIT;
}

async function incrementGlobalCounter(): Promise<void> {
  const exists = await kv.exists(KV_GLOBAL_WINDOW);
  if (exists) {
    await kv.incr(KV_GLOBAL_WINDOW);
  } else {
    await kv.set(KV_GLOBAL_WINDOW, 1, { ex: GLOBAL_RATE_WINDOW_SECONDS });
  }
}

async function getTotalClaims(): Promise<number> {
  return (await kv.get<number>(KV_TOTAL_CLAIMS)) ?? 0;
}

async function incrementTotalClaims(): Promise<void> {
  const exists = await kv.exists(KV_TOTAL_CLAIMS);
  if (exists) {
    await kv.incr(KV_TOTAL_CLAIMS);
  } else {
    await kv.set(KV_TOTAL_CLAIMS, 1);
  }
}

async function getFaucetBalance(): Promise<bigint> {
  const publicClient = getPublicClient();
  const { account } = getWalletClient();

  return publicClient.readContract({
    address: PULSE_TOKEN_ADDRESS,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [account.address],
  });
}

// ============================================
// POST /api/faucet — Claim PULSE tokens
// ============================================

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // 1. Check deployer key is configured
    if (!process.env.DEPLOYER_PRIVATE_KEY) {
      return jsonError("Faucet not configured", 503);
    }

    // 2. Parse request body
    let body: { address?: string };
    try {
      body = await request.json();
    } catch {
      return jsonError("Invalid JSON body", 400);
    }

    const address = body.address?.trim();

    // 3. Validate address
    if (!address) {
      return jsonError("Missing address field", 400);
    }

    if (!isAddress(address)) {
      return jsonError("Invalid Ethereum address", 400);
    }

    if (address.toLowerCase() === ZERO_ADDRESS) {
      return jsonError("Cannot send to zero address", 400);
    }

    // 4. Check if already claimed (per-address rate limit)
    if (await hasAlreadyClaimed(address)) {
      return jsonError("Address has already claimed faucet tokens", 429);
    }

    // 5. Check global rate limit
    if (!(await checkGlobalRateLimit())) {
      return jsonError(
        "Global rate limit reached (max 50 claims per hour). Try again later.",
        429,
      );
    }

    // 6. Check faucet balance
    const balance = await getFaucetBalance();
    if (balance < FAUCET_AMOUNT) {
      return jsonError(
        `Faucet is empty. Remaining balance: ${formatUnits(balance, 18)} PULSE`,
        503,
      );
    }

    // 7. Send tokens
    const { walletClient, account } = getWalletClient();
    const publicClient = getPublicClient();

    const txHash = await walletClient.writeContract({
      address: PULSE_TOKEN_ADDRESS,
      abi: ERC20_ABI,
      functionName: "transfer",
      args: [address as `0x${string}`, FAUCET_AMOUNT],
      account,
    });

    // Wait for confirmation
    await publicClient.waitForTransactionReceipt({ hash: txHash, confirmations: 1 });

    // 8. Record the claim
    await Promise.all([
      markClaimed(address),
      incrementGlobalCounter(),
      incrementTotalClaims(),
    ]);

    return NextResponse.json({
      success: true,
      txHash,
      amount: FAUCET_AMOUNT_DISPLAY,
    });
  } catch (err) {
    console.error("[faucet] Error processing claim:", err);
    const message =
      err instanceof Error ? err.message : "Unknown error";
    return jsonError(`Faucet transaction failed: ${message}`, 500);
  }
}

// ============================================
// GET /api/faucet — Faucet stats
// ============================================

export async function GET(): Promise<NextResponse> {
  try {
    if (!process.env.DEPLOYER_PRIVATE_KEY) {
      return NextResponse.json({
        configured: false,
        totalClaims: 0,
        remainingBalance: "0",
        faucetAmount: FAUCET_AMOUNT_DISPLAY,
      });
    }

    const [totalClaims, balance] = await Promise.all([
      getTotalClaims(),
      getFaucetBalance(),
    ]);

    return NextResponse.json({
      configured: true,
      totalClaims,
      remainingBalance: formatUnits(balance, 18),
      remainingBalanceWei: balance.toString(),
      faucetAmount: FAUCET_AMOUNT_DISPLAY,
      claimsAvailable: Number(balance / FAUCET_AMOUNT),
      tokenAddress: PULSE_TOKEN_ADDRESS,
      chain: "base",
      chainId: 8453,
    });
  } catch (err) {
    console.error("[faucet] Error fetching stats:", err);
    return jsonError("Failed to fetch faucet stats", 500);
  }
}

