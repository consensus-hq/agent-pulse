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

  const keyRecord = issueKey(wallet, ttlSeconds);

  return NextResponse.json({
    ok: true,
    key: keyRecord.key,
    expiresAt: keyRecord.expiresAt,
    ...alive,
  });
}
