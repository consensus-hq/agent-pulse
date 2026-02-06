/**
 * Freshness pricing:
 * - Real-time (age = 0) = 1.5x base
 * - Cached (≤1h) = 0.5x base
 * - Otherwise = base
 * 
 * Note: basePrice should be in atomic units (e.g. Wei or USDC atomic)
 */
export function calculatePrice(basePrice: bigint, cacheAgeSeconds: number): bigint {
  if (cacheAgeSeconds === 0) {
    // Real-time = 1.5x base
    return (basePrice * 150n) / 100n;
  }
  
  if (cacheAgeSeconds <= 3600) {
    // Cached (≤1h) = 0.5x base
    return basePrice / 2n;
  }
  
  // Default = base
  return basePrice;
}

/**
 * Common base prices for Agent Pulse V2 (USDC, 6 decimals)
 * 
 * Pricing aligned to v2 API spec:
 *   reliability: $0.01, liveness-proof: $0.005, signal-history: $0.015,
 *   streak-analysis: $0.008, peer-correlation: $0.02, uptime: $0.01,
 *   predictive-insights: $0.025, global-stats: $0.03
 * 
 * Bundles priced at ~20% discount vs individual sum:
 *   router-check (reliability+liveness+uptime = $0.025 → $0.02)
 *   fleet-check (10x reliability+uptime = $0.20 → $0.15)
 *   risk-report (peer+predictive+streak = $0.053 → $0.04)
 */
export const PRICING_V2 = {
  // Individual endpoints
  RELIABILITY: 10000000n,        // $0.01
  LIVENESS_PROOF: 5000000n,      // $0.005
  SIGNAL_HISTORY: 15000000n,     // $0.015
  STREAK_ANALYSIS: 8000000n,     // $0.008
  PEER_CORRELATION: 20000000n,   // $0.02
  UPTIME: 10000000n,             // $0.01
  PREDICTIVE_INSIGHTS: 25000000n,// $0.025
  GLOBAL_STATS: 30000000n,       // $0.03

  // Bundled queries (~20% discount)
  BUNDLE_ROUTER: 20000000n,      // $0.02 (saves $0.005 vs individual)
  BUNDLE_FLEET: 150000000n,      // $0.15 (saves $0.05 vs 10x individual)
  BUNDLE_RISK: 40000000n,        // $0.04 (saves $0.013 vs individual)
} as const;
