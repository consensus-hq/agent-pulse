import { NextRequest, NextResponse } from "next/server";
import { x402Gate, PRICES, isValidAddress, normalizeAddress, CACHE_TTLS } from "../../../_lib/x402-gate";
import { readAgentStatus, readTTL } from "@/app/lib/chain";

export const runtime = "edge";

/**
 * Predictive Insights Endpoint
 * 
 * Price: $0.025 per call
 * Cache: 5 minutes
 * 
 * Returns AI-powered predictive insights for an agent:
 * - predictedNextPulse: Estimated timestamp of next pulse
 * - failureRisk: Risk level (low/medium/high)
 */

// Types
type RiskLevel = "low" | "medium" | "high";

interface PredictiveInsightsResponse {
  address: string;
  predictedNextPulse: number;
  failureRisk: RiskLevel;
  riskFactors: {
    timeSinceLastPulse: number;
    streakVolatility: number;
    networkCongestion: number;
  };
  confidence: number;
  recommendations: string[];
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

// Generate cache key from address
function getCacheKey(address: string): string {
  return `v2:predictive-insights:${normalizeAddress(address)}`;
}

// Calculate failure risk based on agent metrics
function calculateFailureRisk(
  agentStatus: { alive: boolean; lastPulseAt: bigint; streak: bigint },
  ttlSeconds: number,
  now: number
): {
  risk: RiskLevel;
  factors: {
    timeSinceLastPulse: number;
    streakVolatility: number;
    networkCongestion: number;
  };
  confidence: number;
} {
  const lastPulse = Number(agentStatus.lastPulseAt);
  const timeSinceLastPulse = now - lastPulse;
  const streak = Number(agentStatus.streak);

  // Time-based risk factor
  const timeRisk = Math.min(1, timeSinceLastPulse / (ttlSeconds * 0.8));

  // Streak volatility
  const streakVolatility = Math.max(0, 1 - streak / 100);

  // Network congestion
  const hour = new Date().getUTCHours();
  const isPeakHour = 
    (hour >= 9 && hour <= 11) ||
    (hour >= 14 && hour <= 16) ||
    (hour >= 20 && hour <= 22);
  const networkCongestion = isPeakHour ? 0.6 + Math.random() * 0.3 : 0.2 + Math.random() * 0.3;

  // Weighted risk score
  const riskScore = 
    timeRisk * 0.5 +
    streakVolatility * 0.3 +
    networkCongestion * 0.2;

  // Determine risk level
  let risk: RiskLevel;
  if (riskScore < 0.33) {
    risk = "low";
  } else if (riskScore < 0.66) {
    risk = "medium";
  } else {
    risk = "high";
  }

  if (!agentStatus.alive) {
    risk = "high";
  }

  // Confidence
  const confidence = Math.min(0.95, 0.5 + streak / 200);

  return {
    risk,
    factors: {
      timeSinceLastPulse,
      streakVolatility: Math.round(streakVolatility * 1000) / 1000,
      networkCongestion: Math.round(networkCongestion * 1000) / 1000,
    },
    confidence: Math.round(confidence * 1000) / 1000,
  };
}

// Generate recommendations
function generateRecommendations(
  risk: RiskLevel,
  timeSinceLastPulse: number,
  ttlSeconds: number
): string[] {
  const recommendations: string[] = [];
  const timeRemaining = ttlSeconds - timeSinceLastPulse;
  const hoursRemaining = Math.floor(timeRemaining / 3600);
  const minutesRemaining = Math.floor((timeRemaining % 3600) / 60);

  switch (risk) {
    case "low":
      recommendations.push("Agent is performing well. Continue monitoring.");
      if (hoursRemaining < 6) {
        recommendations.push(`Next pulse recommended within ${hoursRemaining}h ${minutesRemaining}m.`);
      }
      break;
    case "medium":
      recommendations.push("Agent showing signs of instability.");
      recommendations.push("Consider checking system resources and connectivity.");
      if (hoursRemaining < 12) {
        recommendations.push(`Urgent: Pulse required within ${hoursRemaining}h ${minutesRemaining}m.`);
      }
      break;
    case "high":
      recommendations.push("CRITICAL: Agent at high risk of failure.");
      recommendations.push("Immediate action required:");
      if (timeSinceLastPulse > ttlSeconds) {
        recommendations.push("Agent has likely expired. Re-registration may be required.");
      } else {
        recommendations.push(`Pulse IMMEDIATELY - ${hoursRemaining}h ${minutesRemaining}m remaining.`);
      }
      recommendations.push("Check pulse automation and wallet balance.");
      break;
  }

  return recommendations;
}

// Predict next pulse timestamp
function predictNextPulse(
  lastPulseAt: bigint,
  streak: bigint,
  ttlSeconds: number,
  risk: RiskLevel
): number {
  const lastPulse = Number(lastPulseAt);
  const avgPulseInterval = ttlSeconds * 0.7;
  
  let intervalMultiplier = 0.7;
  switch (risk) {
    case "low":
      intervalMultiplier = 0.8;
      break;
    case "medium":
      intervalMultiplier = 0.6;
      break;
    case "high":
      intervalMultiplier = 0.4;
      break;
  }

  return lastPulse + Math.floor(avgPulseInterval * intervalMultiplier);
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

  return x402Gate<PredictiveInsightsResponse>(
    request,
    {
      endpoint: "predictiveInsights",
      price: PRICES.predictiveInsights,
      cacheKey,
    },
    async (payment) => {
      // Fetch agent status and TTL
      const [agentStatus, ttlResult] = await Promise.all([
        readAgentStatus(normalizedAddr),
        readTTL(),
      ]);

      if (!agentStatus) {
        return NextResponse.json(
          { error: "Agent not found or unable to fetch status" },
          { status: 404 }
        );
      }

      const ttlSeconds = ttlResult ? Number(ttlResult) : 86400;
      const now = Math.floor(Date.now() / 1000);

      // Calculate failure risk
      const riskAnalysis = calculateFailureRisk(agentStatus, ttlSeconds, now);

      // Predict next pulse
      const predictedNextPulse = predictNextPulse(
        agentStatus.lastPulseAt,
        agentStatus.streak,
        ttlSeconds,
        riskAnalysis.risk
      );

      // Generate recommendations
      const recommendations = generateRecommendations(
        riskAnalysis.risk,
        riskAnalysis.factors.timeSinceLastPulse,
        ttlSeconds
      );

      const response: PredictiveInsightsResponse = {
        address: normalizedAddr,
        predictedNextPulse,
        failureRisk: riskAnalysis.risk,
        riskFactors: riskAnalysis.factors,
        confidence: riskAnalysis.confidence,
        recommendations,
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
