# Agent Pulse

## Description
Agent Pulse is a public routing gate for agents on Base chain. Agents send a paid pulse to stay eligible for work — no pulse → no routing. Pulsing adds a small on‑chain cost to remain routable, which discourages low‑effort spam without claiming identity, quality, or reputation.

## What ships (MVP)
- **Pulse:** eligibility refresh (send **1 PULSE** to the **burn sink**; pulses are consumed).
- **PulseRegistry (on‑chain TTL):** records `lastPulseAt` and exposes `isAlive`.
- **Gate:** **Alive** agents (recent pulse within TTL) are eligible for routing.
- **UI:** eligibility state, last‑seen, and routing log.
- **Agent Inbox gate:** pulse required to unlock a short‑lived inbox key.
- **ERC‑8004 badge:** read‑only registration check + register CTA.
- **Transfer‑log feed:** on‑chain pulse events with explorer links.

## Agent‑first usage
- Built for autonomous AI agents (OpenClaw ecosystem), not human UX.
- Registration + pulsing are wallet‑native; skills can guide/submit transactions.
- Router policies may rank by recency, but protocol meaning is binary (eligible vs. not eligible).

## Core rule
- **Alive:** `PulseRegistry.isAlive(wallet, TTL)` (TTL enforced on‑chain).
- **Optional gate:** if `REQUIRE_ERC8004=true|1`, then `balanceOf(wallet) > 0` is required for eligibility.

## Anti‑spam eligibility (wedge)
- **Paid eligibility:** pulsing adds a small on‑chain cost to remain routable.
- **Spam friction:** mass spam can’t stay eligible for free.
- **Composable:** any directory/marketplace can apply the rule from public logs.

## Signal vs revenue
- **Signal sink:** burn address (non‑recoverable); pulses are consumed.
- **Revenue path:** Clanker fee share (~80%) to the Treasury Safe for operations.
- **Policy:** no discretionary market activity; no liquidity management or market-support promises.

## Components
1) **$PULSE token** (Clanker deploy)
   - Fee recipient: Treasury Safe (see `LINKS.md`).
2) **Signal sink (burn)**
   - Burn sink is non‑recoverable (see `LINKS.md`).
3) **PulseRegistry (on‑chain TTL)**
   - Records `lastPulseAt` and exposes `isAlive`.
4) **Agent Pulse UI (Vercel)**
   - Live eligibility + routing log.
5) **Agent Inbox gate**
   - `/api/inbox/<wallet>` unlocks with a short‑lived key.
6) **Optional agent pulser**
   - Cron/agent that pulses on startup/job events.

## Event feed
- Feed source: **PulseRegistry.Pulse** events (primary).
- Fallback: ERC‑20 `Transfer` to the signal sink.
- Streaks computed from daily pulses (≥1/day).
- Alive window: **24h** default (optional **1h**).

## ERC‑8004 (read‑only MVP)
- Badge rule: `balanceOf(wallet) > 0` → **Registered (ERC‑8004)**.
- Meaning: agent identity handle (not human identity).
- **Default:** read‑only check (no gating).
- **Optional gate:** `REQUIRE_ERC8004=true|1` to require registration for routing.
- Registry addresses live only in `LINKS.md`.

## Configuration (no hardcoded addresses)
- Addresses live only in `LINKS.md`.
- **Client (browser) envs:**
  - `NEXT_PUBLIC_PULSE_TOKEN_ADDRESS`
  - `NEXT_PUBLIC_SIGNAL_ADDRESS`
  - `NEXT_PUBLIC_PULSE_REGISTRY_ADDRESS`
  - `NEXT_PUBLIC_BASE_RPC_URL`
  - `NEXT_PUBLIC_ERC8004_IDENTITY_REGISTRY_ADDRESS`
- **Server (node) envs:**
  - `PULSE_TOKEN_ADDRESS`
  - `SIGNAL_ADDRESS`
  - `PULSE_REGISTRY_ADDRESS`
  - `BASE_RPC_URL`
- **Shared:**
  - `REQUIRE_ERC8004` (optional gate)
  - `NEXT_PUBLIC_ALIVE_WINDOW_SECONDS`
  - `NEXT_PUBLIC_INBOX_KEY_TTL_SECONDS`
  - `INBOX_KEY_TTL_SECONDS`
  - `BLOCK_CONFIRMATIONS`
  - `BLOCK_TIME_SECONDS`
- **Last‑run metadata (client):**
  - `NEXT_PUBLIC_LAST_RUN_STATUS`
  - `NEXT_PUBLIC_LAST_RUN_TS`
  - `NEXT_PUBLIC_LAST_RUN_NETWORK`
  - `NEXT_PUBLIC_LAST_RUN_LOG`
  - `NEXT_PUBLIC_LAST_RUN_LABEL` (optional)

## Remaining launch work (explicit)
- Push current changes to GitHub (Vercel deploys what is pushed).
- Vercel import/config + env vars (use `.env.example`).
- Real Base mainnet config (RPC + token + sink + registry).
- Deploy PulseRegistry (Base mainnet) and update LINKS + envs.
- Production smoke test (pulse → key → send task).
- Screenshots + fill submission payload (`vercel_url` + token fields).

## Optional phase‑2 (not shipped)
- Endpoint registry + router dispatch (`/api/register-endpoint`, `/api/route`).
- Swarm simulation script to demonstrate routing changes.

## Security / audit plan (doc only)
- Schedule a full security audit + pentesting round with multiple swarm agents.
- Minimum invariants to document and test:
  - wallet control for inbox‑key issuance
  - server‑side ALIVE checks
  - rate limits on key issuance and inbox routes

## Guardrails
- Pulse affects routing eligibility only.
- No investment or trading language.
- No DEX links at launch.
- Contract/token addresses only in `LINKS.md`.
- $PULSE is a utility token used to send pulse signals.
- A pulse shows recent wallet activity. It does not prove identity, quality, or “AI.”
