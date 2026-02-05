import { NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import { isAddress, verifyMessage } from "viem";
import { InboxKeyExistsError, issueKey } from "../../lib/inboxStore";
import { getErc8004Badges } from "../../lib/erc8004";
import { getAgentState, setAgentState } from "@/app/lib/kv";
import { readAgentStatus } from "@/app/lib/chain";

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

const RATE_LIMIT_WINDOW_SECONDS = 60 * 60;
const RATE_LIMIT_MAX_REQUESTS = 10;

const SIGNATURE_WINDOW_MS = 10 * 60 * 1000;


async function checkRateLimit(identifier: string): Promise<{ allowed: boolean; resetAt: number }> {
  const key = `ratelimit:inbox-key:${identifier}`;
  const resetAt = Date.now() + RATE_LIMIT_WINDOW_SECONDS * 1000;

  try {
    const count = await kv.incr(key);
    if (count === 1) {
      await kv.expire(key, RATE_LIMIT_WINDOW_SECONDS);
    }
    return { allowed: count <= RATE_LIMIT_MAX_REQUESTS, resetAt };
  } catch {
    return { allowed: true, resetAt };
  }
}

async function getAliveStatus(wallet: string): Promise<{ state: "alive" | "stale" | "unknown"; alive: boolean; lastPulseAt: number | null }> {
  const normalized = wallet.toLowerCase();

  const cached = await getAgentState(normalized);
  if (cached) {
    return {
      state: cached.isAlive ? "alive" : "stale",
      alive: cached.isAlive,
      lastPulseAt: cached.lastPulse,
    };
  }

  const chainStatus = await readAgentStatus(normalized);
  if (!chainStatus) {
    return { state: "unknown", alive: false, lastPulseAt: null };
  }

  const lastPulseAt = Number(chainStatus.lastPulseAt);
  await setAgentState(normalized, {
    isAlive: chainStatus.alive,
    lastPulse: lastPulseAt,
    streak: Number(chainStatus.streak),
    hazardScore: Number(chainStatus.hazardScore),
  });

  return {
    state: chainStatus.alive ? "alive" : "stale",
    alive: chainStatus.alive,
    lastPulseAt,
  };
}

function rateLimitedResponse(resetAt: number) {
  const retryAfterSeconds = Math.max(0, Math.ceil((resetAt - Date.now()) / 1000));
  return NextResponse.json(
    { ok: false, reason: "rate_limited" },
    {
      status: 429,
      headers: { "Retry-After": retryAfterSeconds.toString() },
    }
  );
}

export async function POST(request: Request) {
  let payload: {
    wallet?: string;
    signature?: string;
    timestamp?: number | string;
  } = {};
  try {
    payload = (await request.json()) as {
      wallet?: string;
      signature?: string;
      timestamp?: number | string;
    };
  } catch {
    payload = {};
  }

  const wallet = payload.wallet?.trim() || "";
  const signature = payload.signature?.trim() || "";
  const timestampRaw = payload.timestamp;

  if (!isAddress(wallet)) {
    return NextResponse.json(
      { ok: false, reason: "invalid_wallet" },
      { status: 400 }
    );
  }

  if (!signature || timestampRaw === undefined || timestampRaw === null) {
    return NextResponse.json(
      { ok: false, reason: "invalid_signature" },
      { status: 400 }
    );
  }

  const timestampValue =
    typeof timestampRaw === "string" ? Number(timestampRaw) : timestampRaw;
  if (!Number.isFinite(timestampValue)) {
    return NextResponse.json(
      { ok: false, reason: "invalid_signature" },
      { status: 400 }
    );
  }

  const timestampMs =
    timestampValue < 1_000_000_000_000
      ? timestampValue * 1000
      : timestampValue;
  const now = Date.now();
  if (Math.abs(now - timestampMs) > SIGNATURE_WINDOW_MS) {
    return NextResponse.json(
      { ok: false, reason: "stale_signature" },
      { status: 400 }
    );
  }

  const message = `inbox-key:${wallet}:${String(timestampRaw)}`;
  let validSignature = false;
  try {
    validSignature = await verifyMessage({
      address: wallet as `0x${string}`,
      message,
      signature: signature as `0x${string}`,
    });
  } catch {
    validSignature = false;
  }
  if (!validSignature) {
    return NextResponse.json(
      { ok: false, reason: "invalid_signature" },
      { status: 400 }
    );
  }

  const rate = await checkRateLimit(wallet.toLowerCase());
  if (!rate.allowed) {
    return rateLimitedResponse(rate.resetAt);
  }

  const alive = await getAliveStatus(wallet);
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

  let keyRecord: Awaited<ReturnType<typeof issueKey>>;
  try {
    keyRecord = await issueKey(wallet, ttlSeconds);
  } catch (error) {
    if (error instanceof InboxKeyExistsError) {
      return NextResponse.json(
        { ok: false, reason: "key_exists" },
        { status: 409 }
      );
    }
    throw error;
  }

  console.log("inbox_key_issued", {
    wallet,
    issuedAt: Date.now(),
    ttlSeconds,
  });

  return NextResponse.json({
    ok: true,
    key: keyRecord.key,
    expiresAt: keyRecord.expiresAt,
    ...alive,
  });
}
