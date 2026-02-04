# QA Checklist

Scope: validate MVP behavior against `docs/AGENT_PULSE.md` and `README.md`.

## Live Vercel QA (production)

### Configuration
- [ ] Vercel project root is `apps/web`.
- [ ] Build command is `npm run build`.
- [ ] Env vars match `.env.example` (client + server).
- [ ] `PULSE_TOKEN_ADDRESS` and `SIGNAL_ADDRESS` set from `LINKS.md` only.
- [ ] `NEXT_PUBLIC_LAST_RUN_*` values render if provided.

### Core MVP (What ships)
- [x] UI: debug console sections render (Routing eligibility console, Status query, Command line, Transmission, Reputation sync, Pulse feed).
- [x] Routing eligibility console: cache age/feed age labels render; values show "—" when empty.
- [ ] Status query: valid address returns TTL + Alive + last pulse; invalid address shows error/empty state. (Live Vercel shows placeholders only; needs registry/RPC env.)
- [x] Command line: curl + cast examples present and use placeholders (no hardcoded addresses).
- [x] Transmission: connect/approve/pulse buttons disabled until wallet connect + allowance; pulse consumes 1 PULSE at sink. (Buttons disabled on live Vercel.)
- [x] Reputation sync: gated by alive status; button disabled until status query confirms alive.
- [ ] Pulse feed: /api/pulse-feed renders entries or empty state; “Missing registry address or RPC URL” only when env missing. (Live Vercel shows missing registry/RPC.)
- [ ] ERC-8004 badge/CTA renders when REQUIRE_ERC8004 enabled (read-only).
- [ ] Pulse: sending **1 PULSE** to sink updates eligibility.
- [ ] Gate: Alive status flips within TTL after pulse.
- [ ] Transfer-log feed: pulse events show with explorer links.

#### Live Vercel notes (2026-02-04)
- Pulse feed shows “Missing registry address or RPC URL” (env likely missing).
- Status query shows placeholders only (needs registry/RPC env to test).
- Wallet actions disabled (expected until wallet connect).

### Inbox gate flow
- [ ] `/api/inbox/<wallet>` denies without key.
- [ ] `/api/inbox-key` issues key post-pulse.
- [ ] `/api/inbox/<wallet>?key=...` returns inbox data.
- [ ] POST to `/api/inbox/<wallet>` with key accepts task.

### Guardrails
- [x] No DEX links in UI (live Vercel).
- [x] Copy uses “paid eligibility / routing signal / anti-spam friction” framing.
- [x] No claims of identity, quality, or reputation.
- [ ] Addresses appear only in `LINKS.md`.

## Local Dev QA (localhost)

### Setup
- [ ] `npm install` completes in `apps/web`.
- [ ] `npm run dev` starts without errors.
- [ ] `.env.example` used as reference for required env vars.

### Functionality
- [ ] Debug console UI loads on localhost and matches core MVP items.
- [ ] Status query + pulse feed operate with local env values.
- [ ] Transmission buttons reflect wallet connection/allowance state.
- [ ] Reputation sync gating matches live behavior.
- [ ] Pulse eligibility logic updates when test wallet is pulsed.
- [ ] Inbox gate behaviors match live flow.
- [ ] ERC-8004 badge renders without errors when envs set.

### Build
- [ ] `npm run build` succeeds locally.
- [ ] If build fails, capture error and remediate.
