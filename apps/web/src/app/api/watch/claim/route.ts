export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { claimDeath } from "../_lib/state";

type ClaimBody = {
  deathId?: string;
  wallet?: string;
};

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = (await req.json().catch(() => null)) as ClaimBody | null;
  if (!body?.deathId || !body.wallet) {
    return NextResponse.json({ error: "Missing required fields: deathId, wallet" }, { status: 400 });
  }

  try {
    const { claim, rewardAtomic } = claimDeath({ deathId: body.deathId, wallet: body.wallet });
    return NextResponse.json({ success: true, claim, rewardAtomic });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const code = msg.includes("not found") ? 404 : msg.includes("Already") ? 409 : 400;
    return NextResponse.json({ error: msg }, { status: code });
  }
}

