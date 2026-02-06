/**
 * Pricing System (Env-Aware)
 * 
 * Freshness pricing:
 * - Real-time (age = 0) = 1.5x base
 * - Cached (≤1h) = 0.5x base
 * - Otherwise = base
 * 
 * Base prices are configured via environment variables (USDC atomic units, 6 decimals).
 * Fallback values match the v2 spec.
 */

// Helper to parse BigInt env vars safely
function getPrice(key: string, defaultVal: bigint): bigint {
  const val = process.env[key];
  if (!val) return defaultVal;
  try {
    return BigInt(val);
  } catch (e) {
    console.warn(`Invalid price for ${key}: ${val}, using default`);
    return defaultVal;
  }
}

export const PRICING_V2 = {
  // Individual endpoints
  RELIABILITY: getPrice("X402_PRICE_RELIABILITY", 10000000n),        // $0.01
  LIVENESS_PROOF: getPrice("X402_PRICE_LIVENESS_PROOF", 5000000n),   // $0.005
  SIGNAL_HISTORY: getPrice("X402_PRICE_SIGNAL_HISTORY", 15000000n),  // $0.015
  STREAK_ANALYSIS: getPrice("X402_PRICE_STREAK_ANALYSIS", 8000000n), // $0.008
  PEER_CORRELATION: getPrice("X402_PRICE_PEER_CORRELATION", 20000000n), // $0.02
  UPTIME: getPrice("X402_PRICE_UPTIME", 10000000n),                  // $0.01
  PREDICTIVE_INSIGHTS: getPrice("X402_PRICE_PREDICTIVE_INSIGHTS", 25000000n), // $0.025
  GLOBAL_STATS: getPrice("X402_PRICE_GLOBAL_STATS", 30000000n),      // $0.03
  
  // New Paid Endpoints
  PULSE_FEED: getPrice("X402_PRICE_PULSE_FEED", 10000000n),          // $0.01
  INBOX_KEY: getPrice("X402_PRICE_INBOX_KEY", 10000000n),            // $0.01
  INBOX: getPrice("X402_PRICE_INBOX", 10000000n),                    // $0.01
  ATTEST: getPrice("X402_PRICE_ATTEST", 10000000n),                  // $0.01
  ATTESTATIONS: getPrice("X402_PRICE_ATTESTATIONS", 5000000n),       // $0.005
  REPUTATION: getPrice("X402_PRICE_REPUTATION", 10000000n),          // $0.01

  // Bundled queries (~20% discount)
  BUNDLE_ROUTER: getPrice("X402_PRICE_BUNDLE_ROUTER", 20000000n),    // $0.02
  BUNDLE_FLEET: getPrice("X402_PRICE_BUNDLE_FLEET", 150000000n),     // $0.15
  BUNDLE_RISK: getPrice("X402_PRICE_BUNDLE_RISK", 40000000n),        // $0.04
} as const;

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
