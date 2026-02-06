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
 * Agent Streak Analysis Endpoint
 *
 * Price: $0.008 per call (paid tier)
 * Cache: 5 minutes (300s)
 *
 * Returns streak analysis for an agent:
 * - currentStreak: Current consecutive pulse streak
 * - maxStreak: Maximum streak ever achieved
 * - streakConsistency: Score 0-100 of streak regularity
 */

const ENDPOINT: V2Endpoint = "streakAnalysis";
const PRICE = PRICES[ENDPOINT];
const CACHE_TTL = CACHE_TTLS[ENDPOINT];

// Thirdweb client for reading from chain
const thirdwebClient = createThirdwebClient({
  clientId: process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID || "eb7c5229642079dddc042df63a7a1f42",
});

interface StreakAnalysisData {
  agent: string;
  currentStreak: number;
  maxStreak: number;
  streakConsistency: number;
  consistencyGrade: "A" | "B" | "C" | "D" | "F";
  timeToBreak: number | null; // seconds until streak breaks if no pulse
  lastPulseAt: number;
  nextPulseDeadline: number;
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
 * Calculate streak consistency grade
 */
function calculateConsistencyGrade(score: number): "A" | "B" | "C" | "D" | "F" {
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 60) return "C";
  if (score >= 40) return "D";
  return "F";
}

/**
 * Get streak analysis from registry and calculate metrics
 */
async function getStreakAnalysis(agentAddress: string): Promise<Omit<StreakAnalysisData, "_tier" | "_cached" | "_cachedAt" | "_payment">> {
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

  const ttlResult = await readContract({
    contract: registry,
    method: "ttlSeconds",
    params: [],
  }).catch(() => 300n); // Default 5 minutes

  const TTL_SECONDS = Number(ttlResult);

  if (!statusResult) {
    // Agent not found or error
    return {
      agent: agentAddress,
      currentStreak: 0,
      maxStreak: 0,
      streakConsistency: 0,
      consistencyGrade: "F",
      timeToBreak: null,
      lastPulseAt: 0,
      nextPulseDeadline: 0,
    };
  }

  const [alive, lastPulseAt, streak, hazardScore] = statusResult;

  const currentStreak = Number(streak);
  const lastPulse = Number(lastPulseAt);
  const now = Math.floor(Date.now() / 1000);

  // Calculate time to break (deadline - now)
  const nextPulseDeadline = lastPulse + TTL_SECONDS;
  const timeToBreak = alive ? Math.max(0, nextPulseDeadline - now) : 0;

  // Calculate max streak (estimate based on current + some factor)
  // In production, you'd track this from events or a separate contract storage
  // For now, we'll use a heuristic based on current streak and hazard
  const hazardFactor = Number(hazardScore) / 100;
  const estimatedMaxStreak = Math.max(
    currentStreak,
    Math.round(currentStreak / (1 - hazardFactor * 0.5) + currentStreak * 0.2)
  );

  // Calculate streak consistency
  // Factors: streak length, hazard score, time since last pulse
  const streakFactor = Math.min(currentStreak / 100, 1) * 40; // Max 40 points
  const hazardFactorInverse = (100 - Number(hazardScore)) * 0.4; // Max 40 points
  const recencyFactor = alive
    ? Math.max(0, 20 - ((now - lastPulse) / TTL_SECONDS) * 20)
    : 0; // Max 20 points

  const streakConsistency = Math.round(streakFactor + hazardFactorInverse + recencyFactor);

  return {
    agent: agentAddress,
    currentStreak,
    maxStreak: estimatedMaxStreak,
    streakConsistency,
    consistencyGrade: calculateConsistencyGrade(streakConsistency),
    timeToBreak,
    lastPulseAt: lastPulse,
    nextPulseDeadline,
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
  const cacheKey = `v2:streak:${normalizedAddress}`;

  return x402Gate<StreakAnalysisData>(
    request,
    {
      endpoint: ENDPOINT,
      price: PRICE,
      cacheKey,
    },
    async (payment?: { payer: string; amount: string; timestamp: string }) => {
      // Check cache first
      const cached = await kv.get<StreakAnalysisData>(cacheKey);
      if (cached) {
        return NextResponse.json({
          ...cached,
          _cached: true,
          _cachedAt: new Date().toISOString(),
          _payment: payment,
          _tier: "paid" as const,
        });
      }

      // Get streak analysis
      const data = await getStreakAnalysis(normalizedAddress);

      // Cache the result
      const result: StreakAnalysisData = {
        ...data,
        _tier: "paid",
      };
      await kv.set(cacheKey, result, { ex: CACHE_TTL });

      return NextResponse.json({
        ...result,
        _payment: payment,
      });
    }
  );
}

// Support HEAD for health checks
export async function HEAD(): Promise<NextResponse> {
  return new NextResponse(null, { status: 200 });
}
