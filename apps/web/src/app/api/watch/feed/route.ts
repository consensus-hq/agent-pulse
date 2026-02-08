export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getDeskWatchState } from "../_lib/state";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const state = getDeskWatchState();
  const sinceParam = req.nextUrl.searchParams.get("since");
  const since = sinceParam ? Number(sinceParam) : 0;
  const safeSince = Number.isFinite(since) && since > 0 ? since : 0;

  const events = state.events
    .filter((e) => e.createdAt > safeSince)
    .slice(0, 60);

  return NextResponse.json({
    events,
    serverTime: Date.now(),
  });
}

