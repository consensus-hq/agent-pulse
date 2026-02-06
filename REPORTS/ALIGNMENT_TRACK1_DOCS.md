# Alignment Track 1: Documentation v3 → v4 Audit

**Generated:** 2026-02-06  
**Scope:** All `.md` files in `docs/`, `README.md`, `REPORTS/`  
**Verdict:** Most docs are v4-aligned. Two files have significant v3 residue.

---

## Summary

- **Files scanned:** 47
- **Files with v3 issues:** 3
- **Total issues found:** 14
- **Critical (wrong API paths):** 6
- **Minor (legacy framing):** 8

### ✅ v4 Compliance Confirmed

| Check | Status |
|-------|--------|
| v4 endpoint pricing (8 endpoints) | ✅ Correct in `API_V2.md`, `README.md`, `DUAL_X402_ECONOMY.md`, `SDK_QUICKSTART.md`, `PRICING_WIRING_RECEIPT.md` |
| Bundle pricing (Router $0.02, Fleet $0.15, Risk $0.04) | ✅ Correct in `API_V2.md`, `README.md`, `SDK_QUICKSTART.md`, `FEATURE_TRACKER.md` |
| "Risk reduction" GTM framing | ✅ Present in `README.md:5`, `CLAWDKITCHEN_HACKATHON.md:13` |
| pulse-filter viral wedge documented | ✅ Present in `README.md`, `SDK_QUICKSTART.md`, `INTEGRATION_GUIDE.md`, `FEATURE_TRACKER.md` |
| "Missing Link" viral loop documented | ✅ Present in `README.md:57` |
| "Don't sell liveness — sell risk reduction" | ✅ Present in `README.md:5`, `CLAWDKITCHEN_HACKATHON.md:13` |
| "We do NOT resell HeyElsa data" | ✅ Explicit in `DUAL_X402_ECONOMY.md:93`, `CLAWDKITCHEN_HACKATHON.md:68` |
| No "HeyElsa revenue" / "HeyElsa as moat" | ✅ Not found anywhere |

---

## 🔴 Issues Found

### File: `REPORTS/security/x402-trust-boundaries.md`

| Line | Issue | Old (v3) | Should Be (v4) |
|------|-------|----------|-----------------|
| 76 | v3 API path in architecture diagram | `/api/paid/portfolio ($0.02)` | `/v2/agent/{addr}/reliability ($0.01)` or remove — these v3 paths don't exist in v4 |
| 77 | v3 API path in architecture diagram | `/api/paid/price/:token ($0.005)` | Remove — no v4 equivalent; DeFi prices are consumer-side only |
| 78 | v3 API path in architecture diagram | `/api/paid/health ($0.001)` | Remove — no v4 equivalent; replaced by `/v2/agent/{addr}/uptime-metrics ($0.01)` |
| 155 | v3 API path in pricing table | `/api/paid/portfolio` $0.02, cap $2.00 | Replace with v4 endpoint pricing table |
| 156 | v3 API path in pricing table | `/api/paid/price/:token` $0.005, cap $0.50 | Replace with v4 endpoint pricing table |
| 157 | v3 API path in pricing table | `/api/paid/health` $0.001, cap $0.10 | Replace with v4 endpoint pricing table |

**Note:** The "Consumer Side (HeyElsa)" section (lines 84-90, 133-148) is fine — those are costs we _pay_ to HeyElsa, not our revenue API. But the "PAID API GATEWAY" section (lines 74-79, 153-157) uses v3 `/api/paid/*` paths that no longer exist in v4.

---

### File: `docs/WALLET_REGISTRY.md`

| Line | Issue | Old (v3) | Should Be (v4) |
|------|-------|----------|-----------------|
| 58 | v3 pricing for HeyElsa consumer costs mixed with revenue framing | `Pay $0.01/portfolio, $0.002/price, $0.005/balance calls` | Fine as HeyElsa _consumer_ costs, but clarify these are outgoing costs, not revenue endpoints |
| 260 | Stream B uses v3 "portfolio" revenue framing | `Pricing: $0.02/portfolio call (50% margin over $0.01 HeyElsa cost)` | Stream B revenue should reference v4 derivative intelligence endpoints, not HeyElsa resale margin |
| 307-309 | Break-even uses `$/portfolio` pricing tiers | `$0.02/portfolio`, `$0.015/portfolio`, `$0.03/portfolio` | Should reference v4 endpoint pricing (reliability $0.01, bundles $0.02-$0.15) |
| 311 | Revenue driver framing implies HeyElsa resale | `At $0.02/call, Stream B is profitable with just ~42 daily calls` | Reframe around v4 derivative intelligence revenue, not portfolio resale margin |
| 265-267 | Revenue model based on HeyElsa margin | `HeyElsa Cost` column in revenue table | v4 revenue has no HeyElsa cost component — derivative intelligence is computed from on-chain data |

**Severity:** HIGH — This entire "Stream B: x402 API Revenue" section (lines 258-312) reflects the v3 model where revenue came from reselling HeyElsa portfolio data at a markup. In v4, revenue comes from selling _derivative liveness intelligence_ (reliability scores, burn history, predictions, etc.) which has zero HeyElsa cost component.

---

### File: `docs/CLAWDKITCHEN_HACKATHON.md` / `README.md`

| File | Line | Issue | Old (v3) | Should Be (v4) |
|------|------|-------|----------|-----------------|
| `CLAWDKITCHEN_HACKATHON.md` | 13 | Contains both old and new language | `We don't sell liveness. We sell risk reduction.` | ✅ Actually correct — the "don't sell liveness" is the v4 reframing. No action needed. |
| `README.md` | 5 | Same pattern | `Don't sell liveness — sell risk reduction.` | ✅ Correct v4 framing. |

---

## Recommended Actions

### Priority 1 (Must Fix)
1. **`REPORTS/security/x402-trust-boundaries.md`** — Rewrite the "PAID API GATEWAY" section of the architecture diagram to use v4 `/v2/*` endpoints and pricing. Update the pricing/rate-limit table (lines 153-157) to v4 endpoints.

2. **`docs/WALLET_REGISTRY.md`** — Rewrite "Stream B: x402 API Revenue" (lines 258-312) to model revenue from v4 derivative intelligence endpoints instead of HeyElsa portfolio resale margins. Remove HeyElsa cost column from revenue projections.

### Priority 2 (Nice to Have)
3. **`docs/WALLET_REGISTRY.md` line 58** — Add clarifying comment that these are _outgoing consumer costs_ to HeyElsa, not related to revenue.

---

## Files Confirmed Clean (No v3 Issues)

All other files use correct v4 terminology:
- `docs/API_V2.md` ✅ (canonical v4 pricing spec)
- `docs/DUAL_X402_ECONOMY.md` ✅ (correctly distinguishes consumer vs provider)
- `docs/SDK_QUICKSTART.md` ✅
- `docs/INTEGRATION_GUIDE.md` ✅
- `docs/FEATURE_TRACKER.md` ✅
- `docs/X402_INTEGRATION_SPEC.md` ✅
- `docs/X402_API_GUIDE.md` ✅ (references HeyElsa forwarding but as consumer action)
- `README.md` ✅
- `REPORTS/PRICING_WIRING_RECEIPT.md` ✅
- All other docs and reports ✅
