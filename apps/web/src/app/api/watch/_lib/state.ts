export type WatchTierId = "scout" | "sentinel" | "sniper";

export type DeskWatchEventType = "round_start" | "round_end" | "watch" | "death" | "claim";

export type DeskWatchRound = {
  id: string;
  startedAt: number; // ms
  endsAt: number; // ms
  status: "active" | "closed";
  endedAt?: number;
};

export type DeskWatchWatch = {
  id: string;
  roundId: string;
  deskId: string;
  wallet: string;
  tier: WatchTierId;
  costAtomic: string; // micro-USDC (6 decimals)
  multiplier: number;
  createdAt: number; // ms
  claimedAt?: number; // ms
  claimedRewardAtomic?: string; // micro-USDC
};

export type DeskWatchPool = {
  roundId: string;
  deskId: string;
  totalAtomic: string; // micro-USDC
  watcherCount: number;
};

export type DeskWatchDeath = {
  id: string;
  roundId: string;
  deskId: string;
  createdAt: number; // ms
  watchersAtDeath: number;
  lastPulseAt?: number; // seconds (optional)
  timeSincePulseMs?: number;
};

export type DeskWatchClaim = {
  id: string;
  deathId: string;
  roundId: string;
  deskId: string;
  wallet: string;
  rewardAtomic: string; // micro-USDC
  createdAt: number; // ms
};

export type DeskWatchLeaderboardEntry = {
  wallet: string;
  totalEarningsAtomic: string; // micro-USDC
  desksCaught: number;
  totalWatches: number;
};

export type DeskWatchEvent = {
  id: string;
  type: DeskWatchEventType;
  createdAt: number; // ms
  message: string;
  deskId?: string;
  wallet?: string;
  tier?: WatchTierId;
  amountAtomic?: string;
};

export type DeskWatchState = {
  rounds: DeskWatchRound[];
  currentRoundId: string | null;
  watches: DeskWatchWatch[];
  pools: Record<string, DeskWatchPool>;
  deaths: DeskWatchDeath[];
  claims: DeskWatchClaim[];
  leaderboard: Record<string, DeskWatchLeaderboardEntry>;
  events: DeskWatchEvent[];
};

declare global {
  // eslint-disable-next-line no-var
  var __deskWatchState: DeskWatchState | undefined;
}

export const ROUND_DURATION_MS = 60 * 60 * 1000;
export const DEFAULT_GAME_TTL_MS = 5 * 60 * 1000;

const PROTOCOL_CUT_BPS = 1000n; // 10%

function poolKey(roundId: string, deskId: string): string {
  return `${roundId}:${deskId}`;
}

function asAtomic(v: bigint): string {
  return v.toString();
}

function parseAtomic(v: string): bigint {
  try {
    return BigInt(v);
  } catch {
    return 0n;
  }
}

function clampEvents(state: DeskWatchState): void {
  // Keep memory bounded for hackathon-mode in-memory state.
  const MAX_EVENTS = 250;
  if (state.events.length > MAX_EVENTS) {
    state.events = state.events.slice(0, MAX_EVENTS);
  }
}

export function getDeskWatchState(): DeskWatchState {
  if (!globalThis.__deskWatchState) {
    globalThis.__deskWatchState = {
      rounds: [],
      currentRoundId: null,
      watches: [],
      pools: {},
      deaths: [],
      claims: [],
      leaderboard: {},
      events: [],
    };
  }
  return globalThis.__deskWatchState;
}

export function pushEvent(
  type: DeskWatchEventType,
  message: string,
  fields?: Omit<DeskWatchEvent, "id" | "type" | "createdAt" | "message">,
): DeskWatchEvent {
  const state = getDeskWatchState();
  const event: DeskWatchEvent = {
    id: `evt_${crypto.randomUUID()}`,
    type,
    createdAt: Date.now(),
    message,
    ...fields,
  };
  state.events.unshift(event);
  clampEvents(state);
  return event;
}

function startNewRound(state: DeskWatchState, nowMs: number): DeskWatchRound {
  const round: DeskWatchRound = {
    id: `round_${crypto.randomUUID()}`,
    startedAt: nowMs,
    endsAt: nowMs + ROUND_DURATION_MS,
    status: "active",
  };
  state.rounds.push(round);
  state.currentRoundId = round.id;
  pushEvent("round_start", "New round started", { amountAtomic: undefined });
  return round;
}

export function ensureCurrentRound(nowMs: number = Date.now()): DeskWatchRound {
  const state = getDeskWatchState();

  const current = state.currentRoundId
    ? state.rounds.find((r) => r.id === state.currentRoundId)
    : undefined;

  if (!current || current.status !== "active") {
    return startNewRound(state, nowMs);
  }

  if (nowMs >= current.endsAt) {
    current.status = "closed";
    current.endedAt = current.endsAt;
    pushEvent("round_end", "Round ended");
    return startNewRound(state, nowMs);
  }

  return current;
}

export function getCurrentRound(): DeskWatchRound {
  const state = getDeskWatchState();
  const roundId = state.currentRoundId;
  const round = roundId ? state.rounds.find((r) => r.id === roundId) : undefined;
  if (!round) return ensureCurrentRound();
  return round;
}

export function getPool(roundId: string, deskId: string): DeskWatchPool {
  const state = getDeskWatchState();
  const key = poolKey(roundId, deskId);
  const existing = state.pools[key];
  if (existing) return existing;

  const created: DeskWatchPool = {
    roundId,
    deskId,
    totalAtomic: "0",
    watcherCount: 0,
  };
  state.pools[key] = created;
  return created;
}

export function addWatch(input: {
  deskId: string;
  wallet: string;
  tier: WatchTierId;
  costAtomic: string;
  multiplier: number;
}): { round: DeskWatchRound; watch: DeskWatchWatch; pool: DeskWatchPool } {
  const state = getDeskWatchState();
  const round = ensureCurrentRound();
  const wallet = input.wallet.toLowerCase();

  const alreadyWatching = state.watches.some(
    (w) => w.roundId === round.id && w.deskId === input.deskId && w.wallet === wallet,
  );
  if (alreadyWatching) {
    throw new Error("Already watching this desk in the current round");
  }

  const watch: DeskWatchWatch = {
    id: `watch_${crypto.randomUUID()}`,
    roundId: round.id,
    deskId: input.deskId,
    wallet,
    tier: input.tier,
    costAtomic: input.costAtomic,
    multiplier: input.multiplier,
    createdAt: Date.now(),
  };
  state.watches.push(watch);

  const pool = getPool(round.id, input.deskId);
  pool.totalAtomic = asAtomic(parseAtomic(pool.totalAtomic) + parseAtomic(input.costAtomic));
  pool.watcherCount += 1;

  if (!state.leaderboard[wallet]) {
    state.leaderboard[wallet] = {
      wallet,
      totalEarningsAtomic: "0",
      desksCaught: 0,
      totalWatches: 0,
    };
  }
  state.leaderboard[wallet].totalWatches += 1;

  pushEvent(
    "watch",
    `Watch added (${input.tier})`,
    { wallet, deskId: input.deskId, tier: input.tier, amountAtomic: input.costAtomic },
  );

  return { round, watch, pool };
}

export function recordDeath(input: {
  deskId: string;
  lastPulseAt?: number;
  timeSincePulseMs?: number;
}): DeskWatchDeath {
  const state = getDeskWatchState();
  const round = ensureCurrentRound();

  const existing = state.deaths.find((d) => d.roundId === round.id && d.deskId === input.deskId);
  if (existing) return existing;

  const watchersAtDeath = state.watches.filter((w) => w.roundId === round.id && w.deskId === input.deskId).length;
  const death: DeskWatchDeath = {
    id: `death_${crypto.randomUUID()}`,
    roundId: round.id,
    deskId: input.deskId,
    createdAt: Date.now(),
    watchersAtDeath,
    lastPulseAt: input.lastPulseAt,
    timeSincePulseMs: input.timeSincePulseMs,
  };
  state.deaths.push(death);

  pushEvent("death", "Desk missed TTL", { deskId: input.deskId, amountAtomic: undefined });
  return death;
}

export function claimDeath(input: {
  deathId: string;
  wallet: string;
}): { claim: DeskWatchClaim; rewardAtomic: string } {
  const state = getDeskWatchState();
  const wallet = input.wallet.toLowerCase();

  const death = state.deaths.find((d) => d.id === input.deathId);
  if (!death) {
    throw new Error("Death event not found");
  }

  const myWatch = state.watches.find(
    (w) => w.roundId === death.roundId && w.deskId === death.deskId && w.wallet === wallet,
  );
  if (!myWatch) {
    throw new Error("No watch found for this desk in that round");
  }
  if (myWatch.claimedAt) {
    throw new Error("Already claimed");
  }

  const pool = getPool(death.roundId, death.deskId);
  const poolTotal = parseAtomic(pool.totalAtomic);
  const rewardPool =
    (poolTotal * 2n * (10_000n - PROTOCOL_CUT_BPS)) / 10_000n;

  const allWatches = state.watches.filter((w) => w.roundId === death.roundId && w.deskId === death.deskId);
  const totalWeight = allWatches.reduce((sum, w) => sum + BigInt(w.multiplier), 0n);
  const myWeight = BigInt(myWatch.multiplier);
  const myReward = totalWeight > 0n ? (rewardPool * myWeight) / totalWeight : 0n;

  myWatch.claimedAt = Date.now();
  myWatch.claimedRewardAtomic = asAtomic(myReward);

  const claim: DeskWatchClaim = {
    id: `claim_${crypto.randomUUID()}`,
    deathId: death.id,
    roundId: death.roundId,
    deskId: death.deskId,
    wallet,
    rewardAtomic: asAtomic(myReward),
    createdAt: Date.now(),
  };
  state.claims.push(claim);

  if (!state.leaderboard[wallet]) {
    state.leaderboard[wallet] = {
      wallet,
      totalEarningsAtomic: "0",
      desksCaught: 0,
      totalWatches: 0,
    };
  }

  state.leaderboard[wallet].totalEarningsAtomic = asAtomic(
    parseAtomic(state.leaderboard[wallet].totalEarningsAtomic) + myReward,
  );
  state.leaderboard[wallet].desksCaught += 1;

  pushEvent(
    "claim",
    "Claim recorded",
    { deskId: death.deskId, wallet, amountAtomic: asAtomic(myReward) },
  );

  return { claim, rewardAtomic: asAtomic(myReward) };
}

