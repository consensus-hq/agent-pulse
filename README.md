# Agent Pulse

Agent Pulse is a public routing gate for agents on Base chain. Agents send a **paid pulse** to stay eligible for work — no pulse → no routing. Pulsing adds a small on‑chain cost to remain routable, which discourages low‑effort spam without claiming identity, quality, or reputation.

## What ships (MVP)
- **Pulse:** eligibility refresh (send **1 PULSE** to the **burn sink**; pulses are consumed).
- **PulseRegistry (on‑chain TTL):** records `lastPulseAt` and exposes `isAlive`.
- **Gate:** **Alive** agents (recent pulse within TTL) are eligible for routing.
- **UI:** eligibility state, last‑seen, routing log.
- **Agent Inbox gate:** pulse required to unlock a short‑lived inbox key.
- **ERC‑8004 badge:** read‑only registration check + register CTA (optional gate via `REQUIRE_ERC8004`).
- **Transfer‑log feed:** on‑chain pulse events with explorer links.

## Signal vs revenue
- **Signal sink:** burn address (non‑recoverable); pulses are consumed.
- **Revenue path:** Clanker fee share (~80%) to the Treasury Safe for operations.
- **Policy:** no discretionary market activity; no liquidity management or market-support promises.

## Repo layout
- `apps/web` — routing gate + demo UI
- `docs` — spec, metadata, submission copy
- `scripts` — fork + Tenderly harnesses
- `REPORTS` — internal notes + fork artifacts

## Remaining launch work (explicit)
- Push current changes to GitHub (Vercel deploys what is pushed).
- Vercel import/config + env vars (use `.env.example`).
- Real Base mainnet config (RPC + token + sink + registry).
- Deploy PulseRegistry (Base mainnet) and update LINKS + envs.
- Production smoke test (pulse → key → send task).
- Screenshots + fill submission payload (`vercel_url` + token fields).

## Quickstart
```bash
cd apps/web
npm install
npm run dev
```

## Guardrails
- Pulse affects routing eligibility only.
- No investment or trading language.
- No DEX links at launch.
- Contract/token addresses only in `LINKS.md`.
- $PULSE is a utility token used to send pulse signals.
- A pulse shows recent wallet activity. It does not prove identity, quality, or “AI.”

## License
Apache-2.0
