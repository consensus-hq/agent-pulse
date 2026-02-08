export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getDeskWatchState } from "../_lib/state";

export async function GET(_req: NextRequest): Promise<NextResponse> {
  const state = getDeskWatchState();
  const entries = Object.values(state.leaderboard)
    .sort((a, b) => {
      const av = BigInt(a.totalEarningsAtomic || "0");
      const bv = BigInt(b.totalEarningsAtomic || "0");
      if (av === bv) return b.desksCaught - a.desksCaught;
      return bv > av ? 1 : -1;
    })
    .slice(0, 20);

  return NextResponse.json({ leaderboard: entries });
}

