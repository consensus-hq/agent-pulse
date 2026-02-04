import { NextResponse } from "next/server";
import { createPublicClient, http, isAddress, parseAbi } from "viem";
import { base } from "viem/chains";

const registryAddress = process.env.NEXT_PUBLIC_PULSE_REGISTRY_ADDRESS as
  | `0x${string}`
  | undefined;
const rpcUrl = process.env.BASE_RPC_URL ?? process.env.NEXT_PUBLIC_BASE_RPC_URL;

const REGISTRY_ABI = parseAbi([
  "function getAgentStatus(address agent) view returns (bool alive, uint256 lastPulseAt, uint256 streak, uint256 hazardScore)",
  "function ttlSeconds() view returns (uint256)",
]);

export async function GET(
  _request: Request,
  { params }: { params: { address: string } }
) {
  const { address } = params;
  if (!isAddress(address)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }

  if (!registryAddress || !rpcUrl) {
    return NextResponse.json(
      { error: "Missing registry address or RPC URL" },
      { status: 500 }
    );
  }

  const client = createPublicClient({ chain: base, transport: http(rpcUrl) });

  try {
    const [status, ttlSeconds] = await Promise.all([
      client.readContract({
        address: registryAddress,
        abi: REGISTRY_ABI,
        functionName: "getAgentStatus",
        args: [address as `0x${string}`],
      }),
      client.readContract({
        address: registryAddress,
        abi: REGISTRY_ABI,
        functionName: "ttlSeconds",
      }),
    ]);

    const [alive, lastPulseAt, streak, hazardScore] = status as [
      boolean,
      bigint,
      bigint,
      bigint
    ];

    return NextResponse.json({
      address,
      isAlive: alive,
      lastPulseAt: Number(lastPulseAt),
      streak: Number(streak),
      hazardScore: Number(hazardScore),
      ttlSeconds: Number(ttlSeconds),
      updatedAt: Date.now(),
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch status" },
      { status: 502 }
    );
  }
}
