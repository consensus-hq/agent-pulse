import { createPublicClient, http, isAddress, parseAbiItem } from "viem";
import { base } from "viem/chains";

const transferEvent = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)"
);

// Use server-only BASE_RPC_URL for server-side API routes (H-4 security fix)
// Falls back to NEXT_PUBLIC_BASE_RPC_URL only for backward compatibility during migration
const rpcUrl =
  process.env.BASE_RPC_URL || process.env.NEXT_PUBLIC_BASE_RPC_URL || "";
const tokenAddress =
  process.env.NEXT_PUBLIC_PULSE_TOKEN_ADDRESS ||
  process.env.PULSE_TOKEN_ADDRESS ||
  "";
const signalSinkAddress =
  process.env.NEXT_PUBLIC_SIGNAL_SINK_ADDRESS ||
  process.env.SIGNAL_SINK_ADDRESS ||
  "";

const aliveWindowSeconds = Number.parseInt(
  process.env.NEXT_PUBLIC_ALIVE_WINDOW_SECONDS ||
    process.env.ALIVE_WINDOW_SECONDS ||
    "86400",
  10
);
const blockTimeSeconds = Number.parseInt(
  process.env.BLOCK_TIME_SECONDS || "2",
  10
);
const confirmations = Number.parseInt(
  process.env.BLOCK_CONFIRMATIONS || "2",
  10
);

const CACHE_TTL_MS = 30_000;
const RPC_TIMEOUT_MS = 5_000;

export type AliveStatus = {
  state: "alive" | "stale" | "unknown";
  alive: boolean;
  lastPulseAt: number | null;
  lastPulseBlock: string | null;
  windowSeconds: number;
};

const globalAliveCache = globalThis as typeof globalThis & {
  __agentPulseAliveCache?: Map<
    string,
    { value: AliveStatus; expiresAt: number }
  >;
};

function getCache() {
  if (!globalAliveCache.__agentPulseAliveCache) {
    globalAliveCache.__agentPulseAliveCache = new Map();
  }
  return globalAliveCache.__agentPulseAliveCache;
}

function unknownStatus(): AliveStatus {
  return {
    state: "unknown",
    alive: false,
    lastPulseAt: null,
    lastPulseBlock: null,
    windowSeconds: aliveWindowSeconds,
  };
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("timeout"));
    }, timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

async function fetchAliveStatus(wallet: string): Promise<AliveStatus> {
  const publicClient = createPublicClient({
    chain: base,
    transport: http(rpcUrl),
  });

  const latestBlock = await publicClient.getBlockNumber();
  const toBlock =
    confirmations > 0 && latestBlock > BigInt(confirmations)
      ? latestBlock - BigInt(confirmations)
      : latestBlock;

  const blocksBack = BigInt(
    Math.max(1, Math.ceil(aliveWindowSeconds / blockTimeSeconds) + 10)
  );
  const fromBlock = toBlock > blocksBack ? toBlock - blocksBack : BigInt(0);

  const logs = await publicClient.getLogs({
    address: tokenAddress as `0x${string}`,
    event: transferEvent,
    args: {
      from: wallet as `0x${string}`,
      to: signalSinkAddress as `0x${string}`,
    },
    fromBlock,
    toBlock,
  });

  if (logs.length === 0) {
    return {
      state: "stale",
      alive: false,
      lastPulseAt: null,
      lastPulseBlock: null,
      windowSeconds: aliveWindowSeconds,
    };
  }

  const lastLog = logs[logs.length - 1];
  const block = await publicClient.getBlock({
    blockNumber: lastLog.blockNumber,
  });

  const lastPulseAt = Number(block.timestamp);
  const now = Math.floor(Date.now() / 1000);
  const alive = now - lastPulseAt <= aliveWindowSeconds;

  return {
    state: alive ? "alive" : "stale",
    alive,
    lastPulseAt,
    lastPulseBlock: lastLog.blockNumber?.toString() ?? null,
    windowSeconds: aliveWindowSeconds,
  };
}

export async function getAliveStatus(wallet: string): Promise<AliveStatus> {
  if (!rpcUrl || !tokenAddress || !signalSinkAddress || !isAddress(wallet)) {
    return unknownStatus();
  }

  const normalized = wallet.toLowerCase();
  const cache = getCache();
  const cached = cache.get(normalized);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  try {
    const result = await withTimeout(
      fetchAliveStatus(normalized),
      RPC_TIMEOUT_MS
    );
    cache.set(normalized, { value: result, expiresAt: now + CACHE_TTL_MS });
    return result;
  } catch {
    const fallback = unknownStatus();
    cache.set(normalized, { value: fallback, expiresAt: now + CACHE_TTL_MS });
    return fallback;
  }
}
