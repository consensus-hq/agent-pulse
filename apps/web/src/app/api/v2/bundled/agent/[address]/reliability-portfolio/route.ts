import { NextRequest, NextResponse } from "next/server";
import { x402Gate, PRICES, isValidAddress, normalizeAddress, CACHE_TTLS } from "../../../_lib/x402-gate";
import { kv } from "@vercel/kv";
import { readAgentStatus } from "@/app/lib/chain";

export const runtime = "edge";

/**
 * Bundled Reliability + Portfolio Endpoint
 * 
 * Price: $0.04 per call
 * 
 * Combines agent reliability metrics with DeFi portfolio data from HeyElsa.
 * Provides a comprehensive view of agent health and financial standing.
 */

// Types
interface ReliabilityPortfolioResponse {
  address: string;
  reliability: {
    score: number;
    uptimePercent: number;
    streak: number;
    lastPulse: number;
    hazardScore: number;
    riskLevel: "low" | "medium" | "high";
  };
  portfolio: {
    totalBalanceUsd: number;
    tokens: Array<{
      symbol: string;
      balance: string;
      priceUsd: number;
      valueUsd: number;
    }>;
    chains: string[];
  } | null;
  combinedScore: number;
  error?: string;
  _payment?: {
    payer: string;
    amount: string;
    timestamp: string;
  };
  _cached?: boolean;
  _cachedAt?: string;
  _tier?: string;
}

// HeyElsa API configuration
const HEYELSA_BASE_URL = process.env.HEYELSA_X402_API_URL || "https://x402-api.heyelsa.ai";

// Generate cache key
function getCacheKey(address: string): string {
  return `v2:bundled:reliability-portfolio:${normalizeAddress(address)}`;
}

// Fetch portfolio from HeyElsa
async function fetchHeyElsaPortfolio(address: string): Promise<{
  totalBalanceUsd: number;
  tokens: Array<{
    symbol: string;
    balance: string;
    priceUsd: number;
    valueUsd: number;
  }>;
  chains: string[];
} | null> {
  try {
    const response = await fetch(`${HEYELSA_BASE_URL}/api/get_portfolio`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        wallet_address: address,
      }),
    });

    if (!response.ok) {
      if (response.status === 402) {
        console.log("[HeyElsa] Portfolio requires payment - skipping in bundle");
        return null;
      }
      console.error("[HeyElsa] Portfolio fetch failed:", response.status);
      return null;
    }

    const data = await response.json();
    
    return {
      totalBalanceUsd: data.totalBalanceUsd || 0,
      tokens: data.tokens || [],
      chains: data.chains || [],
    };
  } catch (error) {
    console.error("[HeyElsa] Portfolio fetch error:", error);
    return null;
  }
}

// Calculate reliability score
function calculateReliabilityScore(
  agentStatus: { alive: boolean; lastPulseAt: bigint; streak: bigint; hazardScore: bigint },
  ttlSeconds: number
): {
  score: number;
  uptimePercent: number;
  riskLevel: "low" | "medium" | "high";
} {
  const now = Math.floor(Date.now() / 1000);
  const lastPulse = Number(agentStatus.lastPulseAt);
  const streak = Number(agentStatus.streak);
  const hazardScore = Number(agentStatus.hazardScore);

  const timeSinceLastPulse = now - lastPulse;
  const timeRisk = timeSinceLastPulse / ttlSeconds;
  const uptimePercent = Math.max(0, 100 - timeRisk * 50 - hazardScore * 0.5);

  const streakComponent = Math.min(50, streak / 2);
  const uptimeComponent = uptimePercent * 0.4;
  const hazardComponent = Math.max(0, 20 - hazardScore * 0.2);

  const score = Math.min(100, streakComponent + uptimeComponent + hazardComponent);

  let riskLevel: "low" | "medium" | "high";
  if (score >= 80) {
    riskLevel = "low";
  } else if (score >= 50) {
    riskLevel = "medium";
  } else {
    riskLevel = "high";
  }

  return {
    score: Math.round(score),
    uptimePercent: Math.round(uptimePercent * 100) / 100,
    riskLevel,
  };
}

// Calculate combined score
function calculateCombinedScore(
  reliabilityScore: number,
  portfolioValue: number
): number {
  const normalizedPortfolio = Math.min(100, Math.log10(Math.max(1, portfolioValue)) * 10);
  return Math.round((reliabilityScore * 0.6 + normalizedPortfolio * 0.4) * 100) / 100;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
): Promise<NextResponse> {
  const { address } = await params;

  // Validate address
  if (!isValidAddress(address)) {
    return NextResponse.json(
      { error: "Invalid Ethereum address format" },
      { status: 400 }
    );
  }

  const normalizedAddr = normalizeAddress(address);
  const cacheKey = getCacheKey(normalizedAddr);

  return x402Gate<ReliabilityPortfolioResponse>(
    request,
    {
      endpoint: "reliabilityPortfolio",
      price: PRICES.reliabilityPortfolio,
      cacheKey,
    },
    async (payment) => {
      // Fetch agent status and portfolio in parallel
      const [agentStatus, portfolio] = await Promise.all([
        readAgentStatus(normalizedAddr),
        fetchHeyElsaPortfolio(normalizedAddr),
      ]);

      if (!agentStatus) {
        return NextResponse.json(
          { error: "Agent not found or unable to fetch status" },
          { status: 404 }
        );
      }

      const ttlSeconds = 86400;

      // Calculate reliability metrics
      const reliability = calculateReliabilityScore(agentStatus, ttlSeconds);

      // Calculate combined score
      const combinedScore = calculateCombinedScore(
        reliability.score,
        portfolio?.totalBalanceUsd || 0
      );

      const response: ReliabilityPortfolioResponse = {
        address: normalizedAddr,
        reliability: {
          score: reliability.score,
          uptimePercent: reliability.uptimePercent,
          streak: Number(agentStatus.streak),
          lastPulse: Number(agentStatus.lastPulseAt),
          hazardScore: Number(agentStatus.hazardScore),
          riskLevel: reliability.riskLevel,
        },
        portfolio,
        combinedScore,
      };

      if (payment) {
        response._payment = {
          payer: payment.payer,
          amount: payment.amount,
          timestamp: payment.timestamp,
        };
      }

      return NextResponse.json(response);
    }
  );
}
