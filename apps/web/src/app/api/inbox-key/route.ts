import { NextResponse } from "next/server";
import { isAddress, verifyMessage } from "viem";
import { getAliveStatus } from "../../lib/alive";
import { InboxKeyExistsError, issueKey } from "../../lib/inboxStore";
import { getErc8004Badges } from "../../lib/erc8004";
import { createRateLimiter } from "../../lib/rateLimit";

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

const rateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  maxRequests: 10,
});

const SIGNATURE_WINDOW_MS = 10 * 60 * 1000;

function rateLimitedResponse(resetMs: number) {
  return NextResponse.json(
    { ok: false, reason: "rate_limited" },
    {
      status: 429,
      headers: { "Retry-After": Math.ceil(resetMs / 1000).toString() },
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

  const rate = rateLimiter.check(wallet.toLowerCase());
  if (!rate.allowed) {
    return rateLimitedResponse(rate.resetMs);
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
