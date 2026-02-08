# Desk Watch (Contracts)

Desk Watch is an on-chain liveness game built on Agent Pulse primitives. It introduces two new contracts:

- `DeskWatchGame.sol`: core game logic (watch pools, death reporting, reward claiming, round settlement).
- `DeskWatchLens.sol`: batch-read helper for frontends (one call returns round + desk + pool state plus live liveness reads).

## How It Integrates

Desk Watch is read-only against existing protocol contracts:

- Reads `PulseRegistryV2.lastPulse()`, `ttl()`, and `isAlive()` to evaluate desk liveness.
- Does not write to existing contracts.

## Repo Layout

- Contracts: `packages/contracts/contracts/DeskWatchGame.sol`, `packages/contracts/contracts/DeskWatchLens.sol`
- Deploy script: `packages/contracts/script/DeployDeskWatch.s.sol`
- Tests: `packages/contracts/test/DeskWatchGame.t.sol`

## Local Build + Test

From `packages/contracts`:

```bash
forge build
forge test -vvv
```

## Deploy (Base)

The deploy script is env-driven (no hardcoded addresses required).

```bash
forge script script/DeployDeskWatch.s.sol:DeployDeskWatch \
  --rpc-url https://mainnet.base.org \
  --broadcast \
  --verify \
  --etherscan-api-key "$BASESCAN_API_KEY" \
  -vvvv
```

Required env vars:

- `PRIVATE_KEY` (deployer)
- `PULSE_REGISTRY` (existing `PulseRegistryV2` address)
- `PROTOCOL_TREASURY` (fee recipient)
- `VC_PULSE_AGENT`, `VC_OPERATOR`
- `CB_PULSE_AGENT`, `CB_OPERATOR`
- `PG_PULSE_AGENT`, `PG_OPERATOR`

## Addresses

Per repo policy:

- Do not hardcode deployed addresses in source.
- Record deployed addresses in `LINKS.md` and wire them into the app via env vars.

## Frontend Hook

Web app hook (wagmi v2):

- `apps/web/src/app/watch/useDeskWatch.ts`
- Configure:
  - `NEXT_PUBLIC_DESK_WATCH_GAME_ADDRESS`
  - `NEXT_PUBLIC_DESK_WATCH_LENS_ADDRESS`
  in `apps/web/.env.example` / Vercel env.

