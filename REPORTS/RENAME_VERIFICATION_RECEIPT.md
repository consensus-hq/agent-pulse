# Compliance Rename Verification Receipt

**Agent:** T2-COMPLIANCE  
**Date:** 2026-02-06  
**Task:** Rename all user-facing "burn" terminology → "signal" in TypeScript/API code

## Summary

All `burn-history`, `burn_history`, `totalBurned`, `burnHistory`, and `BURN_HISTORY` references in TypeScript/TSX files have been renamed to their `signal` equivalents. Zero old names remain in `.ts`/`.tsx` files.

## Files Modified

| File | Changes |
|------|---------|
| `packages/sdk/src/types.ts` | `totalBurned: bigint` → `totalSignaled: bigint` |
| `apps/web/src/lib/pricing.ts` | `BURN_HISTORY` → `SIGNAL_HISTORY`; comment `burn-history` → `signal-history` |
| `apps/web/src/app/api/v2/_lib/x402-gate.ts` | `burnHistory` → `signalHistory` in PRICES, PRICES_MICRO_USDC, CACHE_TTLS; `PRICING_V2.BURN_HISTORY` → `PRICING_V2.SIGNAL_HISTORY` |
| `apps/web/src/app/api/v2/__tests__/x402-gate.test.ts` | `burnHistory` → `signalHistory` in all 3 test assertions |
| `apps/web/src/app/api/v2/agent/[address]/signal-history/route.ts` | **NEW** — full rewrite from burn-history route: all types, interfaces, functions, comments, and variable names renamed (BurnEvent→SignalEvent, BurnHistoryData→SignalHistoryData, getBurnHistory→getSignalHistory, totalBurned→totalSignaled, burnRate→signalRate, etc.) |
| `REPORTS/PRICING_WIRING_RECEIPT.md` | `BURN_HISTORY` → `SIGNAL_HISTORY` in pricing table |

## Directory Rename

- **Deleted:** `apps/web/src/app/api/v2/agent/[address]/burn-history/`
- **Created:** `apps/web/src/app/api/v2/agent/[address]/signal-history/`

## Verification

```
$ grep -rn "burn-history\|burn_history\|totalBurned\|burnHistory\|BURN_HISTORY" --include="*.ts" --include="*.tsx"
(exit code 1 — zero matches)
```

## Excluded (Solidity / Contract Layer)

The following are **intentionally not renamed** per instructions:
- `totalBurned` in Solidity contract code (`PulseRegistryV2.sol`, `IPulseRegistryV2.sol`)
- `totalBurned` in compiled contract JSON artifacts (`packages/contracts/out/`)
- `testPulseV2TracksTotalBurned` and `testPulseBurnsTokens` in Solidity test files
- `networkBurnRate` in `global-stats.test.ts` (refers to protocol-level token economics, not the renamed endpoint)
- `ERC20Burnable` OpenZeppelin references

## Cache Key Change

The route's Redis cache key changed from `v2:burn:{address}` to `v2:signal:{address}`. Old cached entries will naturally expire (TTL 900s). No migration needed.
