import { NextResponse } from "next/server";
import { isAddress } from "viem";
import { getAliveStatus } from "../../lib/alive";
import { issueKey } from "../../lib/inboxStore";
import { getErc8004Badges } from "../../lib/erc8004";

export const runtime = "nodejs";

const ttlSeconds = Number.parseInt(
  process.env.NEXT_PUBLIC_INBOX_KEY_TTL_SECONDS ||
    process.env.INBOX_KEY_TTL_SECONDS ||
    "3600",
  10
);

const requireErc8004 =
  (process.env.REQUIRE_ERC8004 || "").toLowerCase() === "true" ||
  process.env.REQUIRE_ERC8004 === "1";

// Rate limiting: max 10 key issuances per wallet per hour
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

function getRateLimitKey(wallet: string): string {
  return wallet.toLowerCase();
}

function checkRateLimit(wallet: string): { allowed: boolean; remaining: number } {
  const key = getRateLimitKey(wallet);
  const now = Date.now();
  
  // Clean up expired entries periodically (simple cleanup)
  if (rateLimitMap.size > 10000) {
    for (const [k, v] of rateLimitMap.entries()) {
      if (v.resetAt < now) {
        rateLimitMap.delete(k);
      }
    }
  }
  
  const record = rateLimitMap.get(key);
  
  if (!record || record.resetAt < now) {
    // New window or expired window
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, remaining: RATE_LIMIT_MAX - 1 };
  }
  
  if (record.count >= RATE_LIMIT_MAX) {
    return { allowed: false, remaining: 0 };
  }
  
  record.count++;
  return { allowed: true, remaining: RATE_LIMIT_MAX - record.count };
}

export async function POST(request: Request) {
  let payload: { wallet?: string } = {};
  try {
    payload = (await request.json()) as { wallet?: string };
  } catch {
    payload = {};
  }

  const wallet = payload.wallet?.trim() || "";

  if (!isAddress(wallet)) {
    return NextResponse.json(
      { ok: false, reason: "invalid_wallet" },
      { status: 400 }
    );
  }

  // Check rate limit
  const rateLimit = checkRateLimit(wallet);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { ok: false, reason: "rate_limited", retryAfter: "3600" },
      { status: 429 }
    );
  }

  const alive = await getAliveStatus(wallet);
  
  // If alive check fails due to missing registry, return 503
  if (alive.reason === "no_token" || alive.reason === "no_sink") {
    return NextResponse.json(
      { ok: false, reason: "registry_not_configured", ...alive },
      { status: 503 }
    );
  }
  
  if (alive.state !== "alive") {
    return NextResponse.json(
      { ok: false, reason: "not_alive", ...alive },
      { status: 403 }
    );
  }

  if (requireErc8004) {
    const badgeMap = await getErc8004Badges([wallet]);
    if (!badgeMap[wallet]) {
      return NextResponse.json(
        { ok: false, reason: "not_registered", ...alive },
        { status: 403 }
      );
    }
  }

  const keyRecord = issueKey(wallet, ttlSeconds);

  // Log issuance event
  console.log(`[inbox-key] Issued key for ${wallet} at ${new Date().toISOString()}`);

  return NextResponse.json({
    ok: true,
    key: keyRecord.key,
    expiresAt: keyRecord.expiresAt,
    rateLimit: {
      remaining: rateLimit.remaining,
      windowSeconds: 3600,
    },
    ...alive,
  });
}
