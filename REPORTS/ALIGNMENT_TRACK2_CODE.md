# Alignment Track 2: Codebase vs v4 Spec Audit

**Date:** 2026-02-06  
**Auditor:** Codebase Alignment Analyst (subagent)

---

## 1. All API Routes

### Legacy (non-v2)
| Route | Runtime |
|-------|---------|
| `/api/abi/[contract]` | nodejs |
| `/api/abi` | nodejs |
| `/api/anvil` | — |
| `/api/auth/status` | nodejs |
| `/api/badge/[address]` | edge |
| `/api/config` | — |
| `/api/defi` | — |
| `/api/docs` | edge |
| `/api/inbox/cleanup` | nodejs |
| `/api/inbox-key` | nodejs |
| `/api/inbox/[wallet]` | nodejs |
| `/api/internal/health` | nodejs |
| `/api/internal/reindex` | — |
| `/api/paid/health` | ⚠️ STALE |
| `/api/paid/portfolio` | ⚠️ STALE |
| `/api/paid/price/[token]` | ⚠️ STALE |
| `/api/protocol-health` | edge |
| `/api/pulse-feed` | edge |
| `/api/pulse` | nodejs |
| `/api/pulse-webhook` | edge |
| `/api/status/[address]` | edge |

### V2 Individual Endpoints
| Route | v4 Spec Name | Runtime | Match? |
|-------|-------------|---------|--------|
| `/v2/agent/[address]/reliability` | reliability | nodejs | ✅ |
| `/v2/agent/[address]/liveness-proof` | liveness-proof | nodejs | ✅ |
| `/v2/agent/[address]/signal-history` | burn-history | nodejs | ⚠️ NAME MISMATCH |
| `/v2/agent/[address]/streak-analysis` | streak-analysis | nodejs | ✅ |
| `/v2/agent/[address]/uptime-metrics` | uptime-metrics | edge | ✅ |
| `/v2/agent/[address]/predictive-insights` | predictive-insights | edge | ✅ |
| `/v2/network/global-stats` | global-stats | edge | ✅ |
| `/v2/network/peer-correlation/[address]` | peer-correlation | edge | ✅ |
| `/v2/agent/[address]/attest` | — (write) | nodejs | ✅ |
| `/v2/agent/[address]/attestations` | — (read) | nodejs | ✅ |
| `/v2/agent/[address]/reputation` | — (extra) | nodejs | ℹ️ Not in v4 spec |

### V2 Bundle Endpoints
| Route | v4 Spec Name | Runtime | Match? |
|-------|-------------|---------|--------|
| `/v2/bundled/agent/[address]/reliability-portfolio` | risk-report | edge | ⚠️ NAME MISMATCH |
| `/v2/bundled/agent/[address]/uptime-health` | router-check | edge | ⚠️ NAME MISMATCH |
| `/v2/bundled/network/peer-graph` | fleet-check | edge | ⚠️ NAME MISMATCH |

### Missing from v4 Spec
| v4 Endpoint | Status |
|-------------|--------|
| `/v2/agent/[address]/alive` | 🔴 **MISSING** — FREE endpoint, no route exists |

---

## 2. Endpoint Name Mismatches

| Code Name | v4 Spec Name | Severity |
|-----------|-------------|----------|
| `signal-history` | `burn-history` | 🟡 Medium — rename pending |
| `reliability-portfolio` | `risk-report` | 🟡 Medium |
| `uptime-health` | `router-check` | 🟡 Medium |
| `peer-graph` | `fleet-check` | 🟡 Medium |

**Note:** The x402-gate maps bundles incorrectly:
- `reliabilityPortfolio` → priced at `BUNDLE_RISK` ($0.04) — should be risk-report
- `uptimeHealth` → priced at `BUNDLE_ROUTER` ($0.02) — should be router-check  
- `peerGraph` → priced at `BUNDLE_FLEET` ($0.15) — should be fleet-check

The bundle prices appear correct per v4 spec, but the code names are confusing cross-mappings.

---

## 3. Missing `/alive` FREE Endpoint

🔴 **CRITICAL:** No route exists at `/v2/agent/[address]/alive`.

The v4 spec requires a **free** (no x402 payment) `/alive` endpoint. Currently:
- The SDK's `isAlive()` reads directly on-chain via viem
- `pulse-filter` also reads on-chain directly
- No HTTP API endpoint exists for agents that can't do on-chain reads

**Action Required:** Create `/apps/web/src/app/api/v2/agent/[address]/alive/route.ts` — simple on-chain read, NO x402 gate.

---

## 4. Pricing Verification (`pricing.ts`)

| Endpoint | Code Price | v4 Spec Price | Match? |
|----------|-----------|---------------|--------|
| reliability | $0.01 | $0.01 | ✅ |
| liveness-proof | $0.005 | $0.005 | ✅ |
| signal-history | $0.015 | $0.015 | ✅ |
| streak-analysis | $0.008 | $0.008 | ✅ |
| peer-correlation | $0.02 | $0.02 | ✅ |
| uptime-metrics | $0.01 | $0.01 | ✅ |
| predictive-insights | $0.025 | $0.025 | ✅ |
| global-stats | $0.03 | $0.03 | ✅ |
| router-check bundle | $0.02 | $0.02 | ✅ |
| fleet-check bundle | $0.15 | $0.15 | ✅ |
| risk-report bundle | $0.04 | $0.04 | ✅ |

✅ All prices match v4 spec.

---

## 5. x402-gate Endpoint Mapping

The gate maps extra endpoints not in v4 spec:
- `attest` → priced at RELIABILITY ($0.01) — write endpoint, arguably should be free or different
- `attestations` → priced at LIVENESS_PROOF ($0.005) — read endpoint
- `reputation` → priced at RELIABILITY ($0.01) — not in v4 spec at all

**Issue:** `reputation` endpoint exists but is not part of v4 spec. Either add to spec or deprecate.

---

## 6. Stale v3/Legacy Route Remnants

🔴 **Found active stale routes and references:**

### Active route files (should be deleted):
- `/api/paid/health/route.ts`
- `/api/paid/portfolio/route.ts`  
- `/api/paid/price/[token]/route.ts`

### Code references in `apps/web/src/app/api/paid/stats.ts`:
```
"/api/paid/portfolio": 0.02
"/api/paid/price": 0.005
"/api/paid/health": 0.001
```

These legacy routes use OLD pricing (different from v4) and likely bypass x402 entirely.

---

## 7. Runtime Declaration Audit

### Edge routes (stateless, fast):
- `/api/docs`, `/api/pulse-feed`, `/api/badge/[address]`, `/api/protocol-health`, `/api/status/[address]`, `/api/pulse-webhook`
- V2: `predictive-insights`, `uptime-metrics`, `global-stats`, `peer-correlation/[address]`
- V2 bundles: all three (`reliability-portfolio`, `uptime-health`, `peer-graph`)

### Node.js routes (need server features):
- `/api/pulse`, `/api/inbox/*`, `/api/internal/health`, `/api/auth/status`, `/api/abi/*`, `/api/inbox-key`
- V2: `reliability`, `liveness-proof`, `signal-history`, `streak-analysis`, `attest`, `attestations`, `reputation`

### ⚠️ Potential Conflicts:
- `signal-history` uses **nodejs** but similar data endpoints (`uptime-metrics`) use **edge**. Inconsistent — may indicate `signal-history` needs DB access while others are computed.
- `predictive-insights` uses **edge** — verify it doesn't need heavy computation or DB writes.

No hard conflicts detected, but the edge/nodejs split is inconsistent across similar endpoint types.

---

## 8. `packages/pulse-filter/` Analysis

✅ **Exports `filterAlive`** — confirmed in `src/index.ts` line 75, also in `dist/index.d.ts`.

✅ **Does NOT call `/alive` API** — reads directly on-chain via viem `publicClient.readContract()`. This is correct behavior for a middleware package (no HTTP dependency).

Additional exports: `isAgentAlive`, `getRegistryTTL`.

---

## 9. `packages/sdk/` API Surface Audit

### Current SDK methods and their API paths:
| Method | API Path | v4 Endpoint |
|--------|---------|-------------|
| `isAlive()` | On-chain (no API) | ✅ correct (free) |
| `getReliability()` | `/api/paid/reliability` | 🔴 WRONG — should be `/api/v2/agent/{addr}/reliability` |
| `getLivenessProof()` | `/api/paid/liveness-proof` | 🔴 WRONG — should be `/api/v2/agent/{addr}/liveness-proof` |
| `getGlobalStats()` | `/api/paid/global-stats` | 🔴 WRONG — should be `/api/v2/network/global-stats` |
| `getPeerCorrelation()` | `/api/paid/peer-correlation` | 🔴 WRONG — should be `/api/v2/network/peer-correlation/{addr}` |

🔴 **CRITICAL:** The SDK still points to **legacy `/api/paid/` routes** instead of v2 routes. This means SDK users are hitting stale endpoints.

### Missing from SDK:
- `getSignalHistory()` / `getBurnHistory()`
- `getStreakAnalysis()`
- `getUptimeMetrics()`
- `getPredictiveInsights()`
- Bundle methods: `routerCheck()`, `fleetCheck()`, `riskReport()`

---

## 10. Hardcoded Contract Addresses

| Address | Found In | Should Be Env Var? |
|---------|----------|-------------------|
| `0xe61C615743A02983A46aFF66Db035297e8a43846` | `x402-gate.ts:26` (as const) | 🔴 YES |
| `0xe61C615743A02983A46aFF66Db035297e8a43846` | `pulse-webhook/route.ts:28` (fallback) | 🟡 Has env fallback |
| `0xe61C615743A02983A46aFF66Db035297e8a43846` | `lib/insight.ts:32` (fallback) | 🟡 Has env fallback |
| `0x21111B39A502335aC7e45c4574Dd083A69258b07` | `lib/insight.ts:37` (fallback) | 🟡 Has env fallback |
| `0xe61C615743A02983A46aFF66Db035297e8a43846` | `lib/indexer.ts:10` (hardcoded) | 🔴 YES — no env var |

**x402-gate.ts** exports `REGISTRY_CONTRACT` as a hardcoded const — should read from `process.env.REGISTRY_CONTRACT` with fallback.

---

## 11. `burn-history` vs `signal-history` Rename Status

- **Route path:** `signal-history` (not renamed)
- **x402-gate key:** `signalHistory` (not renamed)
- **pricing.ts comment:** says "signal-history" 
- **Tests:** reference `signalHistory`

🟡 **Status: NOT RENAMED.** The v4 spec calls this `burn-history` but all code still uses `signal-history`. This needs a coordinated rename across route path, gate mapping, pricing key, SDK, and tests.

---

## Summary of Critical Issues

| # | Issue | Severity | Action |
|---|-------|----------|--------|
| 1 | `/v2/agent/{addr}/alive` route missing | 🔴 Critical | Create free endpoint |
| 2 | SDK points to legacy `/api/paid/*` routes | 🔴 Critical | Update SDK to v2 paths |
| 3 | Legacy `/api/paid/*` routes still exist | 🔴 High | Delete or redirect to v2 |
| 4 | Bundle route names don't match v4 spec | 🟡 Medium | Rename or alias |
| 5 | `signal-history` → `burn-history` rename pending | 🟡 Medium | Coordinated rename |
| 6 | Hardcoded contract addresses in x402-gate & indexer | 🟡 Medium | Move to env vars |
| 7 | `reputation` endpoint not in v4 spec | 🟡 Low | Add to spec or deprecate |
| 8 | SDK missing 5+ endpoint methods | 🟡 Medium | Add to SDK |
