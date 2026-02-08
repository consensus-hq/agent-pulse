export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { ensureCurrentRound, getDeskWatchState } from "../_lib/state";

type DeskStats = {
  watchers: number;
  poolAtomic: string;
  isDead: boolean;
  deathId?: string;
};

export async function GET(_req: NextRequest): Promise<NextResponse> {
  const round = ensureCurrentRound();
  const state = getDeskWatchState();

  const deskStats: Record<string, DeskStats> = {};

  for (const w of state.watches) {
    if (w.roundId !== round.id) continue;
    if (!deskStats[w.deskId]) {
      deskStats[w.deskId] = { watchers: 0, poolAtomic: "0", isDead: false };
    }
    deskStats[w.deskId].watchers += 1;
    deskStats[w.deskId].poolAtomic = (
      BigInt(deskStats[w.deskId].poolAtomic) + BigInt(w.costAtomic)
    ).toString();
  }

  for (const d of state.deaths) {
    if (d.roundId !== round.id) continue;
    if (!deskStats[d.deskId]) {
      deskStats[d.deskId] = { watchers: 0, poolAtomic: "0", isDead: true, deathId: d.id };
      continue;
    }
    deskStats[d.deskId].isDead = true;
    deskStats[d.deskId].deathId = d.id;
  }

  const roundWatches = state.watches.filter((w) => w.roundId === round.id);
  const roundDeaths = state.deaths.filter((d) => d.roundId === round.id);

  const totalPoolAtomic = roundWatches.reduce((sum, w) => sum + BigInt(w.costAtomic), 0n);
  const totalClaimedAtomic = state.claims.reduce((sum, c) => sum + BigInt(c.rewardAtomic), 0n);

  return NextResponse.json({
    round: {
      id: round.id,
      startedAt: round.startedAt,
      endsAt: round.endsAt,
      remainingMs: Math.max(0, round.endsAt - Date.now()),
      status: round.status,
    },
    deskStats,
    totals: {
      watchers: roundWatches.length,
      poolAtomic: totalPoolAtomic.toString(),
      deaths: roundDeaths.length,
      claimedAtomic: totalClaimedAtomic.toString(),
    },
    serverTime: Date.now(),
  });
}

