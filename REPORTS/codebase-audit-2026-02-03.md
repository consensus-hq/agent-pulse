# Codebase Audit — golem-compute-skill (2026-02-03)

## Scope
Repo: `golem-compute-skill`

Reviewed:
- `README.md`, `SKILL.md`, `tools.json`, `package.json`
- `src/*` (skill core, CLI, fees, swaps, types, idle detection)
- `docs/*` (workflow + hackathon + ecosystem integrations)
- `scripts/*` (yagna ops + fork scans + registration payload)
- `evm/*` (Foundry test token)

External cross‑reference:
- Clanker docs confirm **v4 deployments use Uniswap v4 pools**, which affects liquidity discovery and swap routes.
  - https://clanker.gitbook.io/clanker-documentation/general/token-deployments

## Repo map (high level)
- `src/skill.ts` — main OpenClaw skill class (buy/list/sell compute, fees, tiers)
- `src/cli.ts` — CLI interface for local ops
- `src/fee-manager.ts` — fee accounting + tier gating stubs
- `src/connie-swap.ts` — swap helpers (Uniswap v3) + Base RPC
- `src/idle-detector.ts` — system usage checks
- `docs/` — ops + workflow + hackathon docs
- `scripts/` — yagna preflight/prod-sim, fork scan utilities
- `evm/` — minimal ERC20 token for fork tests

## Key observations

### 1) Docs drift vs tools
- `tools.json` includes **fees/tier/swap** tools not documented in README or SKILL.md.
- `SKILL.md` uses `resources.cpu_cores` but code expects `cpuCores` (camelCase).
- `SKILL.md` lists `GOLEM_WALLET_PRIVATE_KEY`; code uses `SWAP_PRIVATE_KEY`.

### 2) Tier gating is stubbed
- `ConnieTokenGate.checkUserTier()` returns balance=0 and `basic` tier by default.
- CLI advertises an **Access (1+)** tier, but code never returns `access` (only `basic`/`premium`/`pro`).

### 3) Auto‑swap is disabled
- `ConnieSwapManager.autoSwapToConnie()` always returns an error.
- `buyComputeWithAutoSwap()` will fail if `currentConnieBalance < requiredConnie`.

### 4) Uniswap v4 mismatch
- Repo swap logic is **Uniswap v3** only.
- Clanker v4 tokens live on **Uniswap v4**, so pool discovery/swaps will fail unless v4 support is added or explicitly documented as unsupported.

### 5) Fee recipient defaults
- `FeeManager` defaults `feeRecipient` + `updateAuthority` to `0x0` unless provided via config.
- No explicit path is documented for sourcing the treasury address from `/opt/fundbot/work/LINKS.md`.

### 6) Runbook mismatch
- `scripts/preflight.sh` uses `jq` for JSON parsing; runbook says **avoid jq** and use Python instead.

### 7) Provider status stub
- `sellComputeStatus()` returns static zeros for `currentJobs` and `totalEarned`. Only idle resources are real.

### 8) Fork tooling gaps (v4 blind spots)
- `fork-detect-liquidity.ts` discovers pool **contract** addresses from Transfer participants; Uniswap v4 has **no pool contracts** (PoolManager singleton), so this will never find v4 pools.
- `fork-project-token-pool-scan.ts` and `fork-dex-scan.ts` are v2/v3/velo‑only; they cannot detect Clanker v4 liquidity.
- `fork-smoke.ts` uses `amountOutMinimum=0` (fine for smoke tests) and only exercises Uniswap v3.

## Suggested follow‑ups (small, high‑impact)
1) **Docs parity**: update README + SKILL.md to reflect tools.json + env vars.
2) **Tier logic**: implement Access tier or remove from CLI/docs to avoid confusion.
3) **Swap path**: add Uniswap v4 support (PoolManager + hooks) or document limitation explicitly.
4) **QuoterV2**: implement amountOutMinimum quoting for safe swaps.
5) **Fee config**: document and wire treasury recipient + authority into config (no hardcoded address).
6) **Preflight parsing**: replace `jq` usage with Python for JSON parsing.

## Tests
- `npm run build`
- `npm test`

(Integration test remains opt‑in with `GOLEM_INTEGRATION_TEST=1`.)
