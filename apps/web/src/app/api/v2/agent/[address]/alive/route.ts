import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http, isAddress, type Chain } from "viem";
import { base, baseSepolia } from "viem/chains";

/**
 * GET /api/v2/agent/{address}/alive
 * 
 * FREE endpoint — the GTM wedge. No payment required.
 * Returns binary liveness check: is this agent alive on-chain?
 * 
 * Per GTM playbook: "isAlive() and lastPulseTimestamp are free.
 * Liveness checks must be gas-optimized and frictionless.
 * If we gate the basic check, nobody uses the filter."
 */

const CHAIN_ID = process.env.CHAIN_ID || process.env.NEXT_PUBLIC_CHAIN_ID || "8453";
const IS_MAINNET = CHAIN_ID === "8453";

const CHAIN: Chain = IS_MAINNET ? base : baseSepolia;
const DEFAULT_RPC = IS_MAINNET ? "https://mainnet.base.org" : "https://sepolia.base.org";

const PULSE_REGISTRY = process.env.NEXT_PUBLIC_PULSE_REGISTRY || process.env.NEXT_PUBLIC_PULSE_REGISTRY_ADDRESS || "0xe61C615743A02983A46aFF66Db035297e8a43846";
const TTL_SECONDS = 86400; // 24 hours

const REGISTRY_ABI = [
  {
    inputs: [{ name: "agent", type: "address" }],
    name: "getAgentStatus",
    outputs: [
      { name: "isAlive", type: "bool" },
      { name: "lastPulse", type: "uint256" },
      { name: "streak", type: "uint256" },
      { name: "totalBurned", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  const { address } = await params;

  if (!address || !isAddress(address)) {
    return NextResponse.json(
      { error: "Invalid Ethereum address" },
      { status: 400 }
    );
  }

  try {
    const client = createPublicClient({
      chain: CHAIN,
      transport: http(process.env.NEXT_PUBLIC_RPC_URL || DEFAULT_RPC),
    });

    const result = await client.readContract({
      address: PULSE_REGISTRY as `0x${string}`,
      abi: REGISTRY_ABI,
      functionName: "getAgentStatus",
      args: [address as `0x${string}`],
    });

    const [isAlive, lastPulse, streak] = result;
    const lastPulseTimestamp = Number(lastPulse);
    const now = Math.floor(Date.now() / 1000);
    const staleness = lastPulseTimestamp > 0 ? now - lastPulseTimestamp : Infinity;

    return NextResponse.json({
      address: address.toLowerCase(),
      isAlive,
      lastPulseTimestamp,
      streak: Number(streak),
      staleness,
      ttl: TTL_SECONDS,
      checkedAt: new Date().toISOString(),
    }, {
      headers: {
        "Cache-Control": "public, max-age=30, s-maxage=30",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    // If contract call fails (agent never registered), return not alive
    return NextResponse.json({
      address: address.toLowerCase(),
      isAlive: false,
      lastPulseTimestamp: 0,
      streak: 0,
      staleness: Infinity,
      ttl: TTL_SECONDS,
      checkedAt: new Date().toISOString(),
      note: "Agent not found in registry",
    }, {
      headers: {
        "Cache-Control": "public, max-age=30, s-maxage=30",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
}
