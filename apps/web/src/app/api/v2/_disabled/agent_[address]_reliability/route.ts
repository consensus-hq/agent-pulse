// @ts-nocheck
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import { getContract, readContract } from "thirdweb";
import { baseSepolia } from "thirdweb/chains";
import { createThirdwebClient } from "thirdweb";
import {
  x402Gate,
  PRICES,
  CACHE_TTLS,
  isValidAddress,
  normalizeAddress,
  type V2Endpoint,
  REGISTRY_CONTRACT,
} from "../../../_lib/x402-gate";
import { PULSE_REGISTRY_ABI } from "../../../../abi/route";

/**
 * Agent Reliability Endpoint
 *
 * Price: $0.01 per call (paid tier)
 * Cache: 5 minutes (300s)
 *
 * Returns reliability metrics for an agent:
 * - reliabilityScore (0-100)
 * - uptimePercent
 * - jitter
 * - hazardRate
 */

const ENDPOINT: V2Endpoint = "reliability";
const PRICE = PRICES[ENDPOINT];
const CACHE_TTL = CACHE_TTLS[ENDPOINT];

// Thirdweb client for reading from chain
const thirdwebClient = createThirdwebClient({
  clientId: process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID || "eb7c5229642079dddc042df63a7a1f42",
});

interface ReliabilityData {
  agent: string;
  reliabilityScore: number;
  uptimePercent: number;
  jitter: number;
  hazardRate: number;
  lastUpdated: string;
  _tier?: "free" | "paid";
  _cached?: boolean;
  _cachedAt?: string;
  _payment?: {
    payer: string;
    amount: string;
    timestamp: string;
  };
}

/**
 * Calculate reliability metrics from agent status
 */
async function calculateReliabilityMetrics(agentAddress: string): Promise<Omit<ReliabilityData, "_tier" | "_cached" | "_cachedAt" | "_payment">> {
  // Get agent status from registry contract
  const registry = getContract({
    client: thirdwebClient,
    chain: baseSepolia,
    address: REGISTRY_CONTRACT,
    abi: PULSE_REGISTRY_ABI,
  });

  // Read agent status from contract
  const statusResult = await readContract({
    contract: registry,
    method: "getAgentStatus",
    params: [agentAddress as `0x${string}`],
  }).catch(() => null);

  if (!statusResult) {
    // Agent not found or error - return default low reliability
    return {
      agent: agentAddress,
      reliabilityScore: 0,
      uptimePercent: 0,
      jitter: 0,
      hazardRate: 0,
      lastUpdated: new Date().toISOString(),
    };
  }

  const [alive, lastPulseAt, streak, hazardScore] = statusResult;

  // Calculate metrics based on contract data
  const now = Math.floor(Date.now() / 1000);
  const lastPulse = Number(lastPulseAt);
  const timeSincePulse = now - lastPulse;

  // Uptime: based on whether agent is alive and time since last pulse
  // TTL is typically 5 minutes (300s) for testnet
  const TTL_SECONDS = 300;
  const uptimePercent = alive
    ? Math.max(0, 100 - (timeSincePulse / TTL_SECONDS) * 100)
    : 0;

  // Reliability score: weighted combination of uptime, streak, and hazard
  // hazardScore is 0-100 where higher is worse (hazard)
  const streakFactor = Math.min(Number(streak) / 100, 1) * 20; // Max 20 points from streak
  const hazardFactor = (100 - Number(hazardScore)) * 0.3; // Max 30 points from inverse hazard
  const reliabilityScore = Math.round(
    Math.min(100, uptimePercent * 0.5 + streakFactor + hazardFactor)
  );

  // Jitter: simulated based on pulse regularity
  // Lower jitter = more regular pulses = higher reliability
  const jitter = alive
    ? Math.max(0, (timeSincePulse / TTL_SECONDS) * 100 - 50)
    : 100;

  // Hazard rate: directly from contract (0-100)
  const hazardRate = Number(hazardScore);

  return {
    agent: agentAddress,
    reliabilityScore,
    uptimePercent: Math.round(uptimePercent * 100) / 100,
    jitter: Math.round(jitter * 100) / 100,
    hazardRate,
    lastUpdated: new Date().toISOString(),
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
): Promise<NextResponse> {
  const { address } = await params;

  // Validate address
  if (!address || !isValidAddress(address)) {
    return NextResponse.json(
      { error: "Invalid agent address. Must be a valid Ethereum address (0x...)." },
      { status: 400 }
    );
  }

  const normalizedAddress = normalizeAddress(address);
  const cacheKey = `v2:reliability:${normalizedAddress}`;

  return x402Gate<ReliabilityData>(
    request,
    {
      endpoint: ENDPOINT,
      price: PRICE,
      cacheKey,
    },
    async (payment?: { payer: string; amount: string; timestamp: string }) => {
      // Check cache first (for paid tier, we still use cache to save RPC calls)
      const cached = await kv.get<ReliabilityData>(cacheKey);
      if (cached) {
        return NextResponse.json({
          ...cached,
          _cached: true,
          _cachedAt: new Date().toISOString(),
          _payment: payment,
          _tier: "paid" as const,
        });
      }

      // Calculate metrics
      const metrics = await calculateReliabilityMetrics(normalizedAddress);

      // Cache the result
      const data: ReliabilityData = {
        ...metrics,
        _tier: "paid",
      };
      await kv.set(cacheKey, data, { ex: CACHE_TTL });

      return NextResponse.json({
        ...data,
        _payment: payment,
      });
    }
  );
}

// Support HEAD for health checks
export async function HEAD(): Promise<NextResponse> {
  return new NextResponse(null, { status: 200 });
}
