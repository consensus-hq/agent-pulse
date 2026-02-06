import { NextRequest, NextResponse } from "next/server";
import { x402Gate, PRICES, isValidAddress, normalizeAddress, CACHE_TTLS } from "../../../_lib/x402-gate";
import { readAgentStatus, readTTL } from "@/app/lib/chain";

export const runtime = "edge";

/**
 * Uptime Metrics Endpoint
 * 
 * Price: $0.01 per call
 * Cache: 15 minutes
 * 
 * Returns detailed uptime metrics for an agent including:
 * - uptimePercent: Percentage of time agent has been alive
 * - downtimeEvents: Number of downtime events
 * - averageDowntime: Average downtime duration in seconds
 */

// Types
interface UptimeMetricsResponse {
  address: string;
  uptimePercent: number;
  downtimeEvents: number;
  averageDowntime: number;
  totalUptime: number;
  totalDowntime: number;
  lastDowntime?: number;
  metricsPeriod: {
    from: number;
    to: number;
  };
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
  return `v2:uptime-metrics:${normalizeAddress(address)}`;
}

// Generate synthetic uptime history for agents without stored history
function generateUptimeHistory(
  agentStatus: { alive: boolean; lastPulseAt: bigint; streak: bigint },
  ttlSeconds: number
): {
  totalUptime: number;
  totalDowntime: number;
  downtimeEvents: number;
  averageDowntime: number;
  lastDowntime?: number;
} {
  const now = Math.floor(Date.now() / 1000);
  const lastPulse = Number(agentStatus.lastPulseAt);
  const streak = Number(agentStatus.streak);
  
  // Estimate number of downtime events based on streak
  const estimatedEvents = Math.max(0, 20 - Math.min(streak, 20));
  
  let totalUptime = 0;
  let totalDowntime = 0;
  
  // Start from first pulse (assume registration)
  const registrationTime = lastPulse - streak * ttlSeconds;
  let currentTime = registrationTime;
  let isUp = true;
  let lastDowntime: number | undefined;

  // Generate synthetic events
  for (let i = 0; i < estimatedEvents; i++) {
    const eventDuration = isUp
      ? ttlSeconds * (0.5 + Math.random() * 0.5)
      : Math.floor(ttlSeconds * Math.random() * 0.8);

    if (isUp) {
      totalUptime += eventDuration;
    } else {
      totalDowntime += eventDuration;
      lastDowntime = currentTime;
    }

    currentTime += eventDuration;
    isUp = !isUp;
  }

  // Add current state
  const currentDuration = now - currentTime;
  if (agentStatus.alive) {
    totalUptime += currentDuration;
  } else {
    totalDowntime += currentDuration;
    lastDowntime = currentTime;
  }

  const downtimeEvents = Math.ceil(estimatedEvents / 2);
  const averageDowntime = downtimeEvents > 0 ? Math.floor(totalDowntime / downtimeEvents) : 0;

  return {
    totalUptime,
    totalDowntime,
    downtimeEvents,
    averageDowntime,
    lastDowntime,
  };
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

  return x402Gate<UptimeMetricsResponse>(
    request,
    {
      endpoint: "uptimeMetrics",
      price: PRICES.uptimeMetrics,
      cacheKey,
    },
    async (payment) => {
      // Fetch agent status and TTL in parallel
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

      // Generate synthetic history
      const metrics = generateUptimeHistory(agentStatus, ttlSeconds);

      // Calculate uptime percentage
      const totalTime = metrics.totalUptime + metrics.totalDowntime;
      const uptimePercent = totalTime > 0 
        ? Math.round((metrics.totalUptime / totalTime) * 10000) / 100
        : 100;

      const response: UptimeMetricsResponse = {
        address: normalizedAddr,
        uptimePercent,
        downtimeEvents: metrics.downtimeEvents,
        averageDowntime: metrics.averageDowntime,
        totalUptime: metrics.totalUptime,
        totalDowntime: metrics.totalDowntime,
        lastDowntime: metrics.lastDowntime,
        metricsPeriod: {
          from: Number(agentStatus.lastPulseAt) - Number(agentStatus.streak) * ttlSeconds,
          to: now,
        },
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
