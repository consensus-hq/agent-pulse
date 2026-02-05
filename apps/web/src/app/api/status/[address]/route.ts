import { NextRequest, NextResponse } from "next/server";
import { isAddress, parseAbi } from "viem";
import { getBaseClient } from "../../../lib/rpc";

const registryAddress = process.env.NEXT_PUBLIC_PULSE_REGISTRY_ADDRESS as
  | `0x${string}`
  | undefined;

const REGISTRY_ABI = parseAbi([
  "function getAgentStatus(address agent) view returns (bool alive, uint256 lastPulseAt, uint256 streak, uint256 hazardScore)",
  "function ttlSeconds() view returns (uint256)",
]);

const CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=10, stale-while-revalidate=30",
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  const { address } = await params;
  
  if (!isAddress(address)) {
    return NextResponse.json(
      { error: "Invalid address", status: "invalid" },
      { status: 400 }
    );
  }

  // Check for missing registry - return 503 (Service Unavailable) instead of 500
  if (!registryAddress) {
    return NextResponse.json(
      { error: "Registry not configured", status: "unavailable" },
      { status: 503, headers: CACHE_HEADERS }
    );
  }

  // Try to get RPC client
  const client = getBaseClient();
  if (!client) {
    return NextResponse.json(
      { error: "RPC not configured", status: "unavailable" },
      { status: 503, headers: CACHE_HEADERS }
    );
  }

  try {
    // Add timeout to contract reads using Promise.race
    const readWithTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> => {
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Read timeout")), ms)
      );
      return Promise.race([promise, timeout]);
    };

    const [status, ttlSeconds] = await Promise.all([
      readWithTimeout(
        client.readContract({
          address: registryAddress,
          abi: REGISTRY_ABI,
          functionName: "getAgentStatus",
          args: [address as `0x${string}`],
        }) as Promise<[boolean, bigint, bigint, bigint]>,
        10_000
      ),
      readWithTimeout(
        client.readContract({
          address: registryAddress,
          abi: REGISTRY_ABI,
          functionName: "ttlSeconds",
        }) as Promise<bigint>,
        10_000
      ),
    ]);

    const [alive, lastPulseAt, streak, hazardScore] = status;

    return NextResponse.json(
      {
        address,
        isAlive: alive,
        lastPulseAt: Number(lastPulseAt),
        streak: Number(streak),
        hazardScore: Number(hazardScore),
        ttlSeconds: Number(ttlSeconds),
        updatedAt: Date.now(),
      },
      { headers: CACHE_HEADERS }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    
    // Return 503 for service unavailable, 504 for timeout
    const statusCode = errorMessage.includes("timeout") ? 504 : 503;
    
    return NextResponse.json(
      { 
        error: "Failed to fetch status", 
        details: errorMessage,
        status: "unavailable" 
      },
      { status: statusCode, headers: CACHE_HEADERS }
    );
  }
}
