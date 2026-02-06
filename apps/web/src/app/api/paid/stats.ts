/**
 * Stats Tracking Utility for Paid Endpoints
 * 
 * Tracks paid API call metrics in KV for dashboard/monitoring.
 * Other paid routes can import `trackPaidCall` to record their usage.
 */

import { kv } from "@vercel/kv";

// ============================================
// DATE HELPERS
// ============================================

/**
 * Get today's date key in YYYY-MM-DD format
 */
export function getDateKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

// ============================================
// PAID ENDPOINT TRACKING
// ============================================

/**
 * Price mapping for paid endpoints (in USD)
 */
export const ENDPOINT_PRICES: Record<string, number> = {
  "/api/paid/portfolio": 0.02,
  "/api/paid/price": 0.005,
  "/api/paid/health": 0.001,
};

/**
 * Price mapping in micro-USDC (6 decimals) for KV storage
 */
export const ENDPOINT_PRICES_MICRO_USDC: Record<string, number> = {
  "/api/paid/portfolio": 20000,  // $0.02 = 20000 micro-USDC
  "/api/paid/price": 5000,       // $0.005 = 5000 micro-USDC
  "/api/paid/health": 1000,      // $0.001 = 1000 micro-USDC
};

/**
 * Track a successful paid API call in KV
 * 
 * Increments:
 * - stats:daily:{date}:paid:{endpoint}:calls
 * - stats:daily:{date}:paid:{endpoint}:revenue (in micro-USDC)
 * 
 * @param endpoint - The endpoint path (e.g., "/api/paid/portfolio")
 */
export async function trackPaidCall(endpoint: string): Promise<void> {
  const dateKey = getDateKey();
  const callsKey = `stats:daily:${dateKey}:paid:${endpoint}:calls`;
  const revenueKey = `stats:daily:${dateKey}:paid:${endpoint}:revenue`;
  
  const revenueMicroUsdc = ENDPOINT_PRICES_MICRO_USDC[endpoint] || 0;

  const pipeline = kv.pipeline();
  pipeline.incr(callsKey);
  pipeline.incrby(revenueKey, revenueMicroUsdc);
  pipeline.expire(callsKey, 86400); // 24 hours
  pipeline.expire(revenueKey, 86400); // 24 hours
  
  await pipeline.exec();
}

// ============================================
// STATS RETRIEVAL
// ============================================

export interface EndpointStats {
  calls: number;
  revenue: number; // in micro-USDC
}

export interface DailyPaidStats {
  todayCalls: number;
  todayRevenueMicroUsdc: number;
  todayRevenueUsd: number;
  byEndpoint: Record<string, EndpointStats>;
}

/**
 * Get paid endpoint stats for today
 */
export async function getDailyPaidStats(): Promise<DailyPaidStats> {
  const dateKey = getDateKey();
  const endpoints = Object.keys(ENDPOINT_PRICES);

  const stats: Record<string, EndpointStats> = {};
  let totalCalls = 0;
  let totalRevenueMicroUsdc = 0;

  for (const endpoint of endpoints) {
    const callsKey = `stats:daily:${dateKey}:paid:${endpoint}:calls`;
    const revenueKey = `stats:daily:${dateKey}:paid:${endpoint}:revenue`;

    const [calls, revenue] = await Promise.all([
      kv.get<number>(callsKey),
      kv.get<number>(revenueKey),
    ]);

    const endpointStats: EndpointStats = {
      calls: calls || 0,
      revenue: revenue || 0,
    };

    stats[endpoint] = endpointStats;
    totalCalls += endpointStats.calls;
    totalRevenueMicroUsdc += endpointStats.revenue;
  }

  return {
    todayCalls: totalCalls,
    todayRevenueMicroUsdc: totalRevenueMicroUsdc,
    todayRevenueUsd: totalRevenueMicroUsdc / 1_000_000,
    byEndpoint: stats,
  };
}
