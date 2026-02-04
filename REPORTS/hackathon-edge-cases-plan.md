# Hackathon Edge‑Cases & Forward Plan — ClawdKitchen (2026-02-03)

## Objective
Complete the **Uniswap v4 / Clanker v4 liquidity discovery** for PULSE on Base chain and validate a real swap path on a **Base mainnet fork**, with no mocks and production‑grade assumptions.

## Key edge cases to cover (avoid hidden debt)

### Uniswap v4 architecture differences
- **No pool contracts**: v4 uses a single PoolManager; scanning for pool addresses (v2/v3) will return **false negatives**.
- **PoolKey ordering**: `currency0/currency1` must be canonical (address order). Wrong ordering ⇒ wrong PoolId.
- **Hooks are part of the PoolKey**: Clanker v4 pools depend on a hook address; missing or incorrect hook ⇒ pool not found.
- **Fee + tick spacing**: v4 uses fee/tick spacing in PoolKey. If we guess wrong, we will silently miss the pool.

### Base fork + RPC limits
- `eth_getLogs` for large spans can be rate‑limited or fail. We need **chunked log scanning** and retries.
- Public RPCs may return inconsistent data; use a stable fork provider when possible.

### Token pairing assumptions
- We currently assume **WETH/USDC** as the canonical pair. Clanker tokens may use **different pairs** or initial liquidity paths.
- Some tokens may have **0 liquidity** immediately after creation (auction/initial period) or liquidity may move to v4 positions later.

### PULSE address / naming drift
- `HACKATHON_STATE.md` notes a pending token name update. Any mismatch breaks scans, swap tests, and docs.

### Safety + compliance
- **No private keys** committed; ensure fork tests only read from env vars.
- Avoid price/ROI language in any public output or docs.

## Current gaps (observed)
- All pool discovery scripts (`fork-detect-liquidity.ts`, `fork-project-token-pool-scan.ts`, `fork-dex-scan.ts`) are **v2/v3 only**.
- `ProjectTokenSwapManager` is **Uniswap v3‑only**; v4 required for Clanker v4.
- No v4 PoolManager addresses/hooks are sourced or validated.

## Forward plan (concrete steps)

### Phase 1 — Source of truth + addresses
1) Pull **Clanker deployed contracts** and confirm:
   - Uniswap v4 **PoolManager** address on Base
   - Clanker **hook contract** address
   - Any Clanker router/periphery helpers (if they exist)
2) Record addresses in an internal doc (no contract address leaks outside LINKs rules).

### Phase 2 — v4 pool discovery harness (fork‑only)
1) Implement a new script (e.g. `scripts/fork-v4-pool-scan.ts`) that:
   - Builds PoolKey (currency0/currency1, fee, tickSpacing, hooks)
   - Computes PoolId and queries PoolManager state
   - Reads liquidity/slot0 equivalents (as exposed in v4)
2) Add a **log‑scan fallback** over PoolManager events (`Initialize`, `ModifyLiquidity`, `Swap`) with **block chunking**.

### Phase 3 — Fork swap verification
1) Add a **v4 swap smoke test** that:
   - Uses PoolManager + Router (or hook path) to simulate a swap on fork
   - Uses explicit slippage protection (no `amountOutMinimum = 0`)
2) Capture output logs to `/demos` and summarize in `PRODUCT_NOTES.md`.

### Phase 4 — Integration decisions
1) Decide whether the **skill** should support v4 swaps or only the fork harness.
2) If skill supports v4:
   - Add v4 swap implementation in `ConnieSwapManager`
   - Add chainId assert (`8453`) + QuoterV2 or v4 quote equivalent

### Phase 5 — Docs + guardrails
1) Update README/SKILL.md to reflect actual swap path(s) and env vars.
2) Add a small checklist to prevent regressions (token name + address drift).

## Immediate next actions (short list)
- [ ] Fetch + verify Clanker v4 deployed contracts (PoolManager + hook) from official docs.
- [ ] Implement v4 pool scan script (fork‑only).
- [ ] Add log‑chunking utility for PoolManager events.
- [ ] Validate PULSE pool state on Base fork (liquidity + slot0 equivalent).
- [ ] Decide on v4 swap integration vs. documented limitation.

## Success criteria
- We can **deterministically locate** the PULSE pool on Base chain **without guessing**.
- We can **simulate a real swap** on a Base fork with slippage protection.
- Docs + configs match reality (no drift).
