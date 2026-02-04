import { createPublicClient, http, isAddress, parseAbiItem } from "viem";
import { base } from "viem/chains";
import { pulseRegistryAbi } from "./pulseRegistry";

const transferEvent = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)"
);

const rpcUrl =
  process.env.NEXT_PUBLIC_BASE_RPC_URL || process.env.BASE_RPC_URL || "";
const tokenAddress =
  process.env.NEXT_PUBLIC_PULSE_TOKEN_ADDRESS ||
  process.env.PULSE_TOKEN_ADDRESS ||
  "";
const signalAddress =
  process.env.NEXT_PUBLIC_SIGNAL_ADDRESS || process.env.SIGNAL_ADDRESS || "";
const registryAddress =
  process.env.NEXT_PUBLIC_PULSE_REGISTRY_ADDRESS ||
  process.env.PULSE_REGISTRY_ADDRESS ||
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
  alive: boolean;
  lastPulseAt: number | null;
  lastPulseBlock: string | null;
  windowSeconds: number;
};

export async function getAliveStatus(wallet: string): Promise<AliveStatus> {
  if (!rpcUrl || !isAddress(wallet)) {
    return {
      state: "unknown",
      alive: false,
      lastPulseAt: null,
      lastPulseBlock: null,
      windowSeconds: aliveWindowSeconds,
    };
  }

  const hasRegistry = registryAddress && isAddress(registryAddress);
  const hasTransferSource = tokenAddress && signalAddress;

  if (!hasRegistry && !hasTransferSource) {
    return {
      state: "unknown",
      alive: false,
      lastPulseAt: null,
      lastPulseBlock: null,
      windowSeconds: aliveWindowSeconds,
    };
  }

  const publicClient = createPublicClient({
    chain: base,
    transport: http(rpcUrl),
  });

  try {
    if (registryAddress && isAddress(registryAddress)) {
      const [lastPulseAtRaw, lastPulseBlockRaw, isAlive] = await Promise.all([
        publicClient.readContract({
          address: registryAddress as `0x${string}`,
          abi: pulseRegistryAbi,
          functionName: "lastPulseAt",
          args: [wallet as `0x${string}`],
        }),
        publicClient.readContract({
          address: registryAddress as `0x${string}`,
          abi: pulseRegistryAbi,
          functionName: "lastPulseBlock",
          args: [wallet as `0x${string}`],
        }),
        publicClient.readContract({
          address: registryAddress as `0x${string}`,
          abi: pulseRegistryAbi,
          functionName: "isAlive",
          args: [wallet as `0x${string}`, BigInt(aliveWindowSeconds)],
        }),
      ]);

      const lastPulseAt = Number(lastPulseAtRaw);
      const lastPulseBlock = Number(lastPulseBlockRaw);
      const alive = Boolean(isAlive);

      return {
        state: alive ? "alive" : "stale",
        alive,
        lastPulseAt: lastPulseAt > 0 ? lastPulseAt : null,
        lastPulseBlock: lastPulseBlock > 0 ? lastPulseBlock.toString() : null,
        windowSeconds: aliveWindowSeconds,
      };
    }

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
        to: signalAddress as `0x${string}`,
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
  } catch {
    return {
      state: "unknown",
      alive: false,
      lastPulseAt: null,
      lastPulseBlock: null,
      windowSeconds: aliveWindowSeconds,
    };
  }
}
