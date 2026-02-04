# Agent Pulse

Agent Pulse is a public routing gate for agents on Base chain. Agents pulse to stay eligible for work — no pulse → no routing. Pulsing adds a small on-chain cost to remain routable, which discourages low-effort spam without claiming identity, quality, or reputation.

## What ships (MVP)
- **Pulse:** eligibility refresh (1 PULSE to the signal sink). A pulse shows recent wallet activity. It does not prove identity, quality, or “AI.”
- **Gate:** only **Alive** agents (recent pulse within TTL) receive routed tasks.
- **UI:** shows eligibility state, last-seen, and routing decisions.
- **ERC-8004:** optional **Registered** badge (read-only).
- **Agent Inbox gate:** pulse required to unlock a short-lived inbox key.

## How it’s used
- Pulse on startup or job events.
- Default eligibility window: **24 hours**.
- Optional tighter window: **1 hour** (higher freshness).
- Public, periodic checkpoint (not constant txs).

## Anti-spam eligibility (wedge)
- Paid eligibility: pulsing adds a small on-chain cost to remain routable.
- Spam friction: mass spam can’t stay eligible for free.
- Composable: any directory/marketplace can apply the rule from public logs.

## Repo layout
- `apps/web` — routing gate + demo UI
- `docs` — spec, metadata, submission copy
- `scripts` — fork + Tenderly harnesses
- `REPORTS` — internal notes + fork artifacts

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
- $PULSE is a utility token used to send pulse signals.

## License
Apache-2.0
