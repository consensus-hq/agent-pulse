import { NextResponse } from "next/server";
import { createPublicClient, http, parseAbi, parseAbiItem } from "viem";
import { base } from "viem/chains";

const registryAddress = process.env.NEXT_PUBLIC_PULSE_REGISTRY_ADDRESS as
  | `0x${string}`
  | undefined;
const rpcUrl = process.env.BASE_RPC_URL ?? process.env.NEXT_PUBLIC_BASE_RPC_URL;

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

async function kvGet() {
  if (!KV_REST_API_URL || !KV_REST_API_TOKEN) return null;
  const response = await fetch(`${KV_REST_API_URL}/get/${KV_KEY}`, {
    headers: { Authorization: `Bearer ${KV_REST_API_TOKEN}` },
  });
  if (!response.ok) return null;
  const body = await response.json();
  return body?.result ?? null;
}

async function kvSet(value: string) {
  if (!KV_REST_API_URL || !KV_REST_API_TOKEN) return;
  await fetch(
    `${KV_REST_API_URL}/set/${KV_KEY}/${encodeURIComponent(value)}?ex=${CACHE_TTL_SECONDS}`,
    { headers: { Authorization: `Bearer ${KV_REST_API_TOKEN}` } }
  );
}

type PublicClient = ReturnType<typeof createPublicClient>;

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
  if (!registryAddress || !rpcUrl) {
    return NextResponse.json(
      { error: "Missing registry address or RPC URL" },
      { status: 500 }
    );
  }

  const cached = await kvGet();
  if (cached) {
    return NextResponse.json(JSON.parse(cached), {
      headers: { "x-cache": "hit" },
    });
  }

  const client = createPublicClient({ chain: base, transport: http(rpcUrl) });
  const latestBlock = await client.getBlockNumber();
  const fromBlock =
    latestBlock > BLOCK_WINDOW ? latestBlock - BLOCK_WINDOW : BigInt(0);

  const logs = await getLogsWithChunking(client, fromBlock, latestBlock);

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
      const result = await client.readContract({
        address: registryAddress,
        abi: REGISTRY_ABI,
        functionName: "getAgentStatus",
        args: [agent as `0x${string}`],
      });
      const [isAlive, lastPulseAt, streak, hazardScore] = result as [
        boolean,
        bigint,
        bigint,
        bigint
      ];
      return {
        address: agent,
        isAlive,
        lastPulseAt: Number(lastPulseAt),
        streak: Number(streak),
        hazardScore: Number(hazardScore),
      };
    })
  );

  const payload = {
    updatedAt: Date.now(),
    cache: { hit: false, ttlSeconds: CACHE_TTL_SECONDS },
    window: { fromBlock: String(fromBlock), toBlock: String(latestBlock) },
    agents: statusResults,
    recentPulses,
  };

  await kvSet(JSON.stringify(payload));

  return NextResponse.json(payload, { headers: { "x-cache": "miss" } });
}
