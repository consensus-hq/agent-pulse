import { http, isAddress, parseAbiItem, createPublicClient } from "viem";
import { base, baseSepolia } from "viem/chains";

const transferEvent = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)"
);

const rpcUrl =
  process.env.NEXT_PUBLIC_BASE_RPC_URL || process.env.BASE_RPC_URL || "";
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

export type AliveStatus = {
  state: "alive" | "stale" | "unknown";
  reason?: string;
  alive: boolean;
  lastPulseAt: number | null;
  lastPulseBlock: string | null;
  windowSeconds: number;
};

export async function getAliveStatus(wallet: string): Promise<AliveStatus> {
  // Check for missing configuration
  if (!rpcUrl) {
    return {
      state: "unknown",
      reason: "no_rpc",
      alive: false,
      lastPulseAt: null,
      lastPulseBlock: null,
      windowSeconds: aliveWindowSeconds,
    };
  }

  if (!tokenAddress) {
    return {
      state: "unknown",
      reason: "no_token",
      alive: false,
      lastPulseAt: null,
      lastPulseBlock: null,
      windowSeconds: aliveWindowSeconds,
    };
  }

  if (!signalSinkAddress) {
    return {
      state: "unknown",
      reason: "no_sink",
      alive: false,
      lastPulseAt: null,
      lastPulseBlock: null,
      windowSeconds: aliveWindowSeconds,
    };
  }

  if (!isAddress(wallet)) {
    return {
      state: "unknown",
      reason: "invalid_wallet",
      alive: false,
      lastPulseAt: null,
      lastPulseBlock: null,
      windowSeconds: aliveWindowSeconds,
    };
  }

  const chainId = process.env.CHAIN_ID || process.env.NEXT_PUBLIC_CHAIN_ID;
  const chain = chainId === "84532" ? baseSepolia : base;

  const publicClient = createPublicClient({
    chain,
    transport: http(rpcUrl, { timeout: 5_000, retryCount: 1 }),
  });

  try {
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
  } catch (error) {
    return {
      state: "unknown",
      reason: error instanceof Error ? error.message : "rpc_error",
      alive: false,
      lastPulseAt: null,
      lastPulseBlock: null,
      windowSeconds: aliveWindowSeconds,
    };
  }
}
