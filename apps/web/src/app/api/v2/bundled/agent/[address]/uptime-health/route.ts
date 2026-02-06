import { NextRequest, NextResponse } from "next/server";
import { x402Gate, PRICES, isValidAddress, normalizeAddress, CACHE_TTLS } from "../../../_lib/x402-gate";
import { readAgentStatus, readTTL } from "@/app/lib/chain";

export const runtime = "edge";

/**
 * Bundled Uptime + System Health Endpoint
 * 
 * Price: $0.02 per call
 * 
 * Combines agent uptime metrics with system health indicators.
 * Provides a comprehensive operational health view.
 */

// Types
type HealthStatus = "healthy" | "degraded" | "unhealthy";
type IndicatorStatus = "good" | "warning" | "critical";

interface UptimeHealthResponse {
  address: string;
  uptime: {
    uptimePercent: number;
    downtimeEvents: number;
    averageDowntime: number;
    totalUptime: number;
    last24h: {
      uptimePercent: number;
      pulses: number;
    };
  };
  systemHealth: {
    status: HealthStatus;
    score: number;
    indicators: {
      pulseLatency: IndicatorStatus;
      resourceUtilization: IndicatorStatus;
      networkConnectivity: IndicatorStatus;
      walletBalance: IndicatorStatus;
    };
    alerts: string[];
  };
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

// Generate cache key
function getCacheKey(address: string): string {
  return `v2:bundled:uptime-health:${normalizeAddress(address)}`;
}

// Calculate uptime metrics
function calculateUptimeMetrics(
  agentStatus: { alive: boolean; lastPulseAt: bigint; streak: bigint },
  ttlSeconds: number,
  now: number
): UptimeHealthResponse["uptime"] {
  const lastPulse = Number(agentStatus.lastPulseAt);
  const streak = Number(agentStatus.streak);
  
  const estimatedUptime = streak * ttlSeconds * 0.7;
  const timeSinceLastPulse = now - lastPulse;
  const estimatedDowntime = Math.max(0, timeSinceLastPulse - ttlSeconds * 0.7);
  
  const totalTime = estimatedUptime + estimatedDowntime;
  const uptimePercent = totalTime > 0 
    ? Math.round((estimatedUptime / totalTime) * 10000) / 100
    : 100;

  const estimatedEvents = Math.max(0, 10 - Math.floor(streak / 10));
  const averageDowntime = estimatedEvents > 0 
    ? Math.floor(estimatedDowntime / estimatedEvents)
    : 0;

  const pulses24h = Math.min(24, Math.floor(streak / 2));
  const uptimePercent24h = Math.min(100, pulses24h * 4);

  return {
    uptimePercent,
    downtimeEvents: estimatedEvents,
    averageDowntime,
    totalUptime: estimatedUptime,
    last24h: {
      uptimePercent: uptimePercent24h,
      pulses: pulses24h,
    },
  };
}

// Calculate system health
function calculateSystemHealth(
  agentStatus: { alive: boolean; lastPulseAt: bigint; streak: bigint; hazardScore: bigint },
  ttlSeconds: number,
  now: number
): UptimeHealthResponse["systemHealth"] {
  const lastPulse = Number(agentStatus.lastPulseAt);
  const hazardScore = Number(agentStatus.hazardScore);
  const timeSinceLastPulse = now - lastPulse;
  const streak = Number(agentStatus.streak);

  let pulseLatency: IndicatorStatus;
  if (timeSinceLastPulse < ttlSeconds * 0.5) {
    pulseLatency = "good";
  } else if (timeSinceLastPulse < ttlSeconds * 0.8) {
    pulseLatency = "warning";
  } else {
    pulseLatency = "critical";
  }

  let resourceUtilization: IndicatorStatus;
  if (hazardScore < 30) {
    resourceUtilization = "good";
  } else if (hazardScore < 70) {
    resourceUtilization = "warning";
  } else {
    resourceUtilization = "critical";
  }

  let networkConnectivity: IndicatorStatus = agentStatus.alive ? "good" : "critical";
  if (timeSinceLastPulse > ttlSeconds * 0.6 && agentStatus.alive) {
    networkConnectivity = "warning";
  }

  let walletBalance: IndicatorStatus;
  if (streak > 50) {
    walletBalance = "good";
  } else if (streak > 10) {
    walletBalance = "warning";
  } else {
    walletBalance = "critical";
  }

  const indicatorScores = { good: 100, warning: 60, critical: 20 };
  const score = Math.round(
    (indicatorScores[pulseLatency] +
      indicatorScores[resourceUtilization] +
      indicatorScores[networkConnectivity] +
      indicatorScores[walletBalance]) / 4
  );

  let status: HealthStatus;
  if (score >= 80) {
    status = "healthy";
  } else if (score >= 50) {
    status = "degraded";
  } else {
    status = "unhealthy";
  }

  const alerts: string[] = [];
  if (pulseLatency === "warning") {
    alerts.push("Pulse latency elevated - consider checking automation");
  } else if (pulseLatency === "critical") {
    alerts.push("CRITICAL: Agent approaching TTL expiration");
  }

  if (resourceUtilization === "warning") {
    alerts.push("Hazard score increasing - review system resources");
  } else if (resourceUtilization === "critical") {
    alerts.push("CRITICAL: High hazard score detected");
  }

  if (networkConnectivity === "warning") {
    alerts.push("Network connectivity degraded");
  } else if (networkConnectivity === "critical") {
    alerts.push("CRITICAL: Agent appears offline");
  }

  if (walletBalance === "warning") {
    alerts.push("Low activity streak - monitor wallet balance");
  } else if (walletBalance === "critical") {
    alerts.push("CRITICAL: Very low streak - ensure sufficient funds");
  }

  return {
    status,
    score,
    indicators: {
      pulseLatency,
      resourceUtilization,
      networkConnectivity,
      walletBalance,
    },
    alerts,
  };
}

// Generate recommendations
function generateRecommendations(
  health: UptimeHealthResponse["systemHealth"],
  uptime: UptimeHealthResponse["uptime"]
): string[] {
  const recommendations: string[] = [];

  switch (health.status) {
    case "healthy":
      recommendations.push("System operating normally. Continue monitoring.");
      if (uptime.uptimePercent < 95) {
        recommendations.push("Consider improving uptime to achieve 99%+ reliability");
      }
      break;
    case "degraded":
      recommendations.push("System showing signs of stress. Investigate alerts.");
      if (health.indicators.pulseLatency !== "good") {
        recommendations.push("Review pulse automation scheduling");
      }
      if (health.indicators.resourceUtilization !== "good") {
        recommendations.push("Check system resource usage and optimize if needed");
      }
      break;
    case "unhealthy":
      recommendations.push("IMMEDIATE ACTION REQUIRED");
      recommendations.push("1. Check agent status and pulse history");
      recommendations.push("2. Verify wallet has sufficient balance for pulses");
      recommendations.push("3. Review automation and infrastructure");
      recommendations.push("4. Consider manual pulse if close to expiration");
      break;
  }

  if (uptime.downtimeEvents > 5) {
    recommendations.push(`Frequent downtime detected (${uptime.downtimeEvents} events). Consider more robust infrastructure.`);
  }

  if (uptime.last24h.uptimePercent < 80) {
    recommendations.push("Poor 24h performance - review recent changes");
  }

  return recommendations;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
): Promise<NextResponse> {
  const { address } = await params;

  if (!isValidAddress(address)) {
    return NextResponse.json(
      { error: "Invalid Ethereum address format" },
      { status: 400 }
    );
  }

  const normalizedAddr = normalizeAddress(address);
  const cacheKey = getCacheKey(normalizedAddr);

  return x402Gate<UptimeHealthResponse>(
    request,
    {
      endpoint: "uptimeHealth",
      price: PRICES.uptimeHealth,
      cacheKey,
    },
    async (payment) => {
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

      const uptime = calculateUptimeMetrics(agentStatus, ttlSeconds, now);
      const systemHealth = calculateSystemHealth(agentStatus, ttlSeconds, now);
      const recommendations = generateRecommendations(systemHealth, uptime);

      const response: UptimeHealthResponse = {
        address: normalizedAddr,
        uptime,
        systemHealth,
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
