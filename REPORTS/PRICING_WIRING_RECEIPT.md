# Pricing Wiring Receipt

**Agent:** T1-PRICING  
**Date:** 2026-02-06  
**Status:** ✅ Complete

## What Changed

### `apps/web/src/app/api/v2/_lib/x402-gate.ts`
- **Added import** of `PRICING_V2` and `calculatePrice` from `@/lib/pricing`
- **Replaced hardcoded** `PRICES` and `PRICES_MICRO_USDC` objects with values **derived at module load** from `PRICING_V2` constants via `ENDPOINT_BASE_PRICES` mapping
- **Added `getDynamicPrice(endpoint, cacheAgeSeconds)`** — allows routes to opt into freshness-based pricing (real-time 1.5×, cached ≤1h 0.5×, else base)
- **Re-exported `calculatePrice`** so routes can import it from the gate module
- **Added `atomicToUsdString()`** helper to convert bigint atomic USDC → `"$0.01"` strings

### No Route Changes Required
All 14 route files already reference `PRICES[endpoint]` or `PRICES.endpointName` from `x402-gate.ts`. Since the shape and keys of `PRICES` are unchanged, all routes automatically pick up pricing from `pricing.ts` with zero edits.

## Price Mapping

| Endpoint | PRICING_V2 Constant | Value |
|---|---|---|
| reliability | RELIABILITY | $0.01 |
| livenessProof | LIVENESS_PROOF | $0.005 |
| signalHistory | SIGNAL_HISTORY | $0.015 |
| streakAnalysis | STREAK_ANALYSIS | $0.008 |
| peerCorrelation | PEER_CORRELATION | $0.02 |
| uptimeMetrics | UPTIME | $0.01 |
| predictiveInsights | PREDICTIVE_INSIGHTS | $0.025 |
| globalStats | GLOBAL_STATS | $0.03 |
| reliabilityPortfolio | BUNDLE_RISK | $0.04 |
| peerGraph | BUNDLE_FLEET | $0.15 |
| uptimeHealth | BUNDLE_ROUTER | $0.02 |
| attest | RELIABILITY | $0.01 |
| attestations | LIVENESS_PROOF | $0.005 |
| reputation | RELIABILITY | $0.01 |

## Notes
- `peerGraph` price changed from hardcoded $0.05 → BUNDLE_FLEET $0.15 (now matches pricing.ts spec)
- `attest`, `attestations`, `reputation` mapped to closest PRICING_V2 tier since they lack dedicated constants
- Zero hardcoded prices remain in routes or gate module
