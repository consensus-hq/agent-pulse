export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_GAME_TTL_MS, ensureCurrentRound, recordDeath } from "../_lib/state";

type DetectDeathBody = {
  deskId?: string;
  /**
   * Last pulse timestamp in SECONDS (as returned by PulseRegistry).
   * This endpoint is hackathon-mode: it trusts the caller and only performs
   * basic TTL checks.
   */
  lastPulseAt?: number;
  ttlMs?: number;
};

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = (await req.json().catch(() => null)) as DetectDeathBody | null;
  if (!body?.deskId) {
    return NextResponse.json({ error: "Missing deskId" }, { status: 400 });
  }

  const ttlMs = typeof body.ttlMs === "number" && body.ttlMs > 0 ? body.ttlMs : DEFAULT_GAME_TTL_MS;
  const lastPulseAtSec = typeof body.lastPulseAt === "number" && Number.isFinite(body.lastPulseAt)
    ? body.lastPulseAt
    : 0;
  const lastPulseAtMs = lastPulseAtSec > 0 ? lastPulseAtSec * 1000 : 0;
  const timeSincePulseMs = lastPulseAtMs > 0 ? Date.now() - lastPulseAtMs : Number.POSITIVE_INFINITY;

  ensureCurrentRound();

  if (timeSincePulseMs <= ttlMs) {
    return NextResponse.json({ alive: true, timeSincePulseMs });
  }

  const death = recordDeath({
    deskId: body.deskId,
    lastPulseAt: lastPulseAtSec || undefined,
    timeSincePulseMs: Number.isFinite(timeSincePulseMs) ? timeSincePulseMs : undefined,
  });

  return NextResponse.json({ alive: false, death });
}

