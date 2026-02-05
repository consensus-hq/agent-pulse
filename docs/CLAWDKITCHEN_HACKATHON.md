# ClawdKitchen hackathon (AI agents only)
Source: https://clawd.kitchen/registration.md

## Project
**Agent Pulse** — public routing gate for agents on Base chain. Agents send a paid pulse to stay eligible for work; no pulse → no routing. Pulsing adds a small on‑chain cost to remain routable, which discourages low‑effort spam without claiming identity, quality, or reputation.

## MVP scope
- **Pulse:** eligibility refresh (send **1 PULSE** to the **burn sink**; pulses are consumed).
- **Gate:** **Alive** agents (recent pulse within TTL) are eligible for routing.
- **UI:** eligibility state, last‑seen, routing log.
- **Agent Inbox gate:** pulse required to unlock a short‑lived inbox key.
- **ERC‑8004 badge:** read‑only registration check + register CTA (agent identity handle; gate optional via `REQUIRE_ERC8004`).
- **Transfer‑log feed:** on‑chain pulse events with explorer links.

## Agent‑first framing
- Built for autonomous AI agents (OpenClaw ecosystem), not human UX.
- Registration + pulsing are wallet‑native; skills can guide/submit transactions.

## Anti‑spam eligibility (wedge)
- **Paid eligibility:** pulsing adds a small on‑chain cost to remain routable.
- **Spam friction:** mass spam can’t stay eligible for free.
- **Composable:** any directory/marketplace can apply the rule from public logs.

## Signal vs revenue
- **Signal sink:** burn address (non‑recoverable); pulses are consumed.
- **Revenue path:** Clanker fee share (~80%) to the Treasury Safe for operations.
- **Policy:** no discretionary market activity; no liquidity management or market-support promises.

## Hackathon fit (CLAWDKITCHEN)
- Chain: **Base (Ethereum L2)**
- Requirement: build on Base chain, ship in 7 days, AI agents only
- Submission: deploy on Base chain mainnet and ship a working product
- Token: launch via Clanker or Bankr
- Scoring: usability, onchain vibes, UI/UX, on‑chain activity (transfer count)

## Current status (2026-02-04)
- P0 order: env lock → token deploy → PulseRegistry/tests → deploy/verify/owner → API → UI → smoke/determinism.
- Signal sink is fixed in `LINKS.md`; token + Vercel URL still TBD.
- Live Vercel QA is blocked by missing registry/RPC envs.

## Constraints
- Addresses only in `LINKS.md` (no reposting in docs/posts).
- No DEX links at launch.
- No market/ROI language; avoid trading framing.
- Worktree + PR for every feature.
- TypeScript‑only for new code.
- EOA deploy allowed (explicit override) for speed; ownership + fees must route to Treasury Safe.
- External posts (X/Moltbook) require explicit approval before publishing.

## Registration steps
- **Post on X** (requires explicit approval before posting)
  - Must mention: @callusfbi, @ClawnchDev, @base
  - Must include hashtag: #ClawdKitchen
  - Must state you’re an AI agent joining
  - Save the post URL
- **Post on Moltbook** (requires explicit approval before posting)
  - Must announce participation
  - Encourage other agents to join
  - Save the post URL
- **Register via API**
  - POST https://clawd.kitchen/api/register
  - JSON body:
    ```json
    {
      "agent_name": "Connie",
      "wallet_address": "<Treasury Safe (Base chain)>",
      "twitter_post_url": "https://x.com/...",
      "moltbook_post_url": "https://moltbook.com/post/..."
    }
    ```

## Submission endpoint
POST https://clawd.kitchen/api/submit

We should submit:
- `github_url`
- `vercel_url`
- `contract_address` (if applicable; omit if no custom contract)
- `token_address` + `token_url` (PULSE)

## Implementation notes
- Use env/config for addresses; never hardcode.
- Feed reads on‑chain pulse events for eligibility.
- Alive window default **24h** (optional **1h**); stale if no pulse in window.
- ERC‑8004 status uses Identity Registry (address stored in `LINKS.md`).
- Fork rehearsal is optional for debug; mainnet deploy is required for submission.

## Remaining launch work (explicit)
- Push current changes to GitHub (Vercel deploys what is pushed).
- Vercel import/config + env vars (use `.env.example`).
- Real Base mainnet config (RPC + token + sink).
- Production smoke test (pulse → key → send task).
- Screenshots + fill submission payload (`vercel_url` + token fields).
- Deployment runbook: `docs/DEPLOYMENT_RUNBOOK.md`.

## Launch checklist (reorganized)
1) **Launch blockers**
   - [x] Review feedback and update documentation in its entirety
   - [x] Integrate the reorganized list into documentation
   - [x] Ask clarifying questions if needed before updates (not needed)
   - [x] Use another agent to break feedback into a large bullet list of items and final decisions
   - [x] Pass checked list to another agent to reorganize
   - [x] Check off what has already been completed
   - [x] Do not omit items already done or clarified (noted)
   - [x] ~70% complete toward current MVP scope (paid‑eligibility gate + inbox‑key flow + ERC‑8004 read‑only check + docs/submission artifacts)
   - [x] Repo consolidated to `agent-pulse/`
   - [x] Inbox key gate implemented
   - [x] Gated inbox endpoint implemented
   - [x] ALIVE checks implemented
   - [x] `apps/web` build passes locally
   - [x] Explicitly document AI‑agent‑first framing (OpenClaw ecosystem; not human UX)
   - [x] Registration flow is agent‑centric (wallet signs tx; skills can guide/submit)
   - [x] ERC‑8004 badge described as agent identity handle (not human identity)
2) **Vercel deploy steps**
   - [ ] Vercel import/config + env vars
   - [ ] Import `consensus-hq/agent-pulse`
   - [ ] Root Directory: `apps/web`
   - [ ] Framework: Next.js
   - [ ] Install: `npm ci` (or default)
   - [ ] Build: `npm run build`
   - [ ] Use `.env.example` as canonical env var list
   - [ ] Push current changes to GitHub (Vercel deploys what is pushed)
3) **Env vars (use `.env.example`)**
   - [ ] Required (server): `BASE_RPC_URL`, `PULSE_TOKEN_ADDRESS`, `SIGNAL_ADDRESS`
   - [ ] Required (client): `NEXT_PUBLIC_BASE_RPC_URL`, `NEXT_PUBLIC_PULSE_TOKEN_ADDRESS`, `NEXT_PUBLIC_SIGNAL_ADDRESS`, `NEXT_PUBLIC_PULSE_REGISTRY_ADDRESS`, `NEXT_PUBLIC_IDENTITY_REGISTRY_ADDRESS`
   - [ ] Recommended: `NEXT_PUBLIC_ALIVE_WINDOW_SECONDS=86400`, `BLOCK_TIME_SECONDS=2`, `BLOCK_CONFIRMATIONS=2`, `INBOX_KEY_TTL_SECONDS=3600`, `NEXT_PUBLIC_INBOX_KEY_TTL_SECONDS`
   - [ ] Optional: `REQUIRE_ERC8004` (default OFF), `NEXT_PUBLIC_ERC8004_REGISTER_URL`, `NEXT_PUBLIC_PULSE_FEED_URL`, `NEXT_PUBLIC_LAST_RUN_STATUS`, `NEXT_PUBLIC_LAST_RUN_TS`, `NEXT_PUBLIC_LAST_RUN_NETWORK`, `NEXT_PUBLIC_LAST_RUN_LOG`
   - [x] Canonical LAST_RUN env names match `.env.example` (use `NEXT_PUBLIC_LAST_RUN_TS`, not TIMESTAMP)
4) **Base mainnet config**
   - [ ] Real Base mainnet config (RPC + token + sink)
5) **Smoke test**
   - [ ] Production smoke test (pulse → key → send task)
   - [ ] Smoke test sequence (demo → inbox gate → fail pre‑pulse → send 1 PULSE → key success → send test task → GET inbox list)
6) **Submission payload + screenshots**
   - [x] Docs/submission draft/payload updated (routing gate / anti‑spam framing)
   - [ ] Screenshots + fill submission payload (`vercel_url` + token fields)
7) **Branding/copy rules**
   - [x] Frame as anti‑spam paid eligibility, not verification
   - [x] Use “paid eligibility / routing signal / anti‑spam friction / routable‑eligible / TTL” language
   - [x] Avoid “verified / trusted / reputation / quality / proof of AI” language
   - [x] Include safe core line about on‑chain cost discouraging spam without claiming identity/quality
   - [x] Optional ranking framed as router policy only (recency), not protocol guarantee
   - [x] Docs/UI: label pulses as consumed/burned; avoid market language; remove deflation/market-support claims
   - [x] Policy: no discretionary market activity; avoid market/LP promises; no buy/sell framing
   - [x] Compliance guardrails: anti‑spam wedge, avoid market/trading language, no DEX links
8) **Addresses + LINKS.md rules**
   - [x] Signal path: PULSE eligibility is burned at the sink
   - [x] Sink address is a burn sink (set in `agent-pulse/LINKS.md`)
   - [x] Revenue path: Clanker fee share (~80%) to Treasury Safe (separate from sink)
   - [x] Treasury Safe set as fee recipient (in `agent-pulse/LINKS.md`)
   - [x] Indexing: ALIVE checks remain `Transfer(to == SIGNAL_ADDRESS)`; only sink address changes
   - [x] `agent-pulse/LINKS.md`: Treasury Safe set to fee recipient
   - [x] `agent-pulse/LINKS.md`: signal sink burn address set
   - [x] Root LINKS aligned to `agent-pulse/LINKS.md` (no inline addresses)
   - [x] Update docs to reference LINKS.md for sink/treasury (no inline addresses)
   - [x] Contract/token addresses only in `agent-pulse/LINKS.md` + env vars
9) **Optional phase‑2 router/sim**
   - [x] Document optional /api/register-endpoint + /api/route (ALIVE‑only routing, round‑robin)
   - [x] Document optional swarm sim script (routing changes)
   - [x] If adding router/endpoint registry + swarm sim: document as optional/phase‑2 (not shipped)
   - [ ] Endpoint registry must be persistent/production‑ready (Cloudflare D1/KV); no in‑memory only for production
   - [ ] Provide/compose ERC‑8004 registration helper skill for agents
   - [ ] Provide/compose pulse helper skill for agents
10) **Security notes (write‑only)**
   - [x] Add a full security audit + pentesting round with multiple swarm agents (doc only)
   - [x] Include minimal security invariants (wallet control for keys, server‑side ALIVE checks, rate limits, etc.)

## Phase‑2 (optional, not shipped)
- Endpoint registry + router dispatch (`/api/register-endpoint`, `/api/route`).
- Swarm simulation script to demonstrate routing changes.

## Security / audit plan (doc only)
- Schedule a full security audit + pentesting round with multiple swarm agents.
- Document invariants: wallet control for key issuance, server‑side ALIVE checks, rate limits.
- Detailed plan: `docs/PENTEST_PLAN.md`.

## Guardrails
- Pulse affects routing eligibility only.
- Use “Base chain” or “Base (Ethereum L2)” wording.
- No investment or trading language.
- No DEX links at launch.
- $PULSE is a utility token used to send pulse signals.
- A pulse shows recent wallet activity. It does not prove identity, quality, or “AI.”
