import { NextResponse } from "next/server";
import { parseAbi, parseAbiItem, type PublicClient } from "viem";
import { getBaseClient } from "../../lib/rpc";

const registryAddress = process.env.NEXT_PUBLIC_PULSE_REGISTRY_ADDRESS as
  | `0x${string}`
  | undefined;

const KV_REST_API_URL = process.env.KV_REST_API_URL;
const KV_REST_API_TOKEN = process.env.KV_REST_API_TOKEN;

const CACHE_TTL_SECONDS = 30;
const BLOCK_WINDOW = BigInt(20_000);
const MAX_AGENTS = 250;

const REGISTRY_ABI = parseAbi([
  "function getAgentStatus(address agent) view returns (bool alive, uint256 lastPulseAt, uint256 streak, uint256 hazardScore)",
]);

const PULSE_EVENT = parseAbiItem(
  "event Pulse(address indexed agent, uint256 amount, uint256 timestamp, uint256 streak)"
);

const KV_KEY = "pulse-feed:v1";

const CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=10, stale-while-revalidate=30",
};

async function kvGet() {
  if (!KV_REST_API_URL || !KV_REST_API_TOKEN) return null;
  try {
    const response = await fetch(`${KV_REST_API_URL}/get/${KV_KEY}`, {
      headers: { Authorization: `Bearer ${KV_REST_API_TOKEN}` },
    });
    if (!response.ok) return null;
    const body = await response.json();
    return body?.result ?? null;
  } catch {
    return null;
  }
}

async function kvSet(value: string) {
  if (!KV_REST_API_URL || !KV_REST_API_TOKEN) return;
  try {
    await fetch(
      `${KV_REST_API_URL}/set/${KV_KEY}/${encodeURIComponent(value)}?ex=${CACHE_TTL_SECONDS}`,
      { headers: { Authorization: `Bearer ${KV_REST_API_TOKEN}` } }
    );
  } catch {
    // Silently fail - KV is optional
  }
}

type PulseLogs = Awaited<ReturnType<PublicClient["getLogs"]>>;

async function getLogsWithChunking(
  client: PublicClient,
  fromBlock: bigint,
  toBlock: bigint
): Promise<PulseLogs> {
  try {
    return await client.getLogs({
      address: registryAddress,
      event: PULSE_EVENT,
      fromBlock,
      toBlock,
    });
  } catch {
    if (fromBlock >= toBlock) return [];
    const mid = fromBlock + (toBlock - fromBlock) / 2n;
    const left = await getLogsWithChunking(client, fromBlock, mid);
    const right = await getLogsWithChunking(client, mid + 1n, toBlock);
    return [...left, ...right];
  }
}

export async function GET() {
  // If no registry configured, return empty feed with 200 (not 500)
  if (!registryAddress) {
    return NextResponse.json(
      {
        agents: [],
        recentPulses: [],
        updatedAt: Date.now(),
        error: "Registry not deployed yet",
      },
      { status: 200, headers: CACHE_HEADERS }
    );
  }

  const client = getBaseClient();
  if (!client) {
    return NextResponse.json(
      {
        agents: [],
        recentPulses: [],
        updatedAt: Date.now(),
        error: "RPC not configured",
      },
      { status: 200, headers: CACHE_HEADERS }
    );
  }

  // Check KV cache
  const cached = await kvGet();
  if (cached) {
    return NextResponse.json(JSON.parse(cached), {
      headers: { ...CACHE_HEADERS, "x-cache": "hit" },
    });
  }

  try {
    const readWithTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> => {
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Read timeout")), ms)
      );
      return Promise.race([promise, timeout]);
    };

    const latestBlock = await readWithTimeout(client.getBlockNumber() as Promise<bigint>, 10_000);
    const fromBlock =
      latestBlock > BLOCK_WINDOW ? latestBlock - BLOCK_WINDOW : BigInt(0);

    const logs = (await getLogsWithChunking(
      client as unknown as PublicClient,
      fromBlock,
      latestBlock
    )) as Array<{
      args?: {
        agent?: `0x${string}`;
        amount?: bigint;
        timestamp?: bigint;
        streak?: bigint;
      };
      transactionHash?: `0x${string}` | null;
      blockNumber?: bigint | null;
    }>;

    const recentPulses = logs
      .map((log) => ({
        agent: String(log.args?.agent),
        amount: String(log.args?.amount ?? BigInt(0)),
        timestamp: Number(log.args?.timestamp ?? BigInt(0)),
        streak: Number(log.args?.streak ?? BigInt(0)),
        txHash: log.transactionHash ?? "",
        blockNumber: log.blockNumber ? String(log.blockNumber) : "",
      }))
      .sort((a, b) => b.timestamp - a.timestamp);

    const uniqueAgents: string[] = [];
    for (const pulse of recentPulses) {
      if (!pulse.agent || uniqueAgents.includes(pulse.agent)) continue;
      uniqueAgents.push(pulse.agent);
      if (uniqueAgents.length >= MAX_AGENTS) break;
    }

    const statusResults = await Promise.all(
      uniqueAgents.map(async (agent) => {
        try {
          const result = await readWithTimeout(
            client.readContract({
              address: registryAddress,
              abi: REGISTRY_ABI,
              functionName: "getAgentStatus",
              args: [agent as `0x${string}`],
            }) as Promise<[boolean, bigint, bigint, bigint]>,
            10_000
          );
          const [isAlive, lastPulseAt, streak, hazardScore] = result;
          return {
            address: agent,
            isAlive,
            lastPulseAt: Number(lastPulseAt),
            streak: Number(streak),
            hazardScore: Number(hazardScore),
          };
        } catch {
          return null;
        }
      })
    );

    const payload = {
      updatedAt: Date.now(),
      cache: { hit: false, ttlSeconds: CACHE_TTL_SECONDS },
      window: { fromBlock: String(fromBlock), toBlock: String(latestBlock) },
      agents: statusResults.filter((a): a is NonNullable<typeof a> => a !== null),
      recentPulses,
    };

    await kvSet(JSON.stringify(payload));

    return NextResponse.json(payload, {
      headers: { ...CACHE_HEADERS, "x-cache": "miss" },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    
    return NextResponse.json(
      {
        agents: [],
        recentPulses: [],
        updatedAt: Date.now(),
        error: errorMessage,
      },
      { status: 200, headers: CACHE_HEADERS }
    );
  }
}
