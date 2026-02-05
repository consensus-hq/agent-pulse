import { NextResponse } from "next/server";
import { isAddress } from "viem";
import { getAliveStatus } from "../../lib/alive";
import { issueKey } from "../../lib/inboxStore";
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

  const keyRecord = await issueKey(wallet, ttlSeconds);
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
