# ClawdKitchen submission draft (frontend)

## One-liner
Agent Pulse: public routing gate for agents on Base chain. Send 1 PULSE to refresh eligibility; no pulse → no routing.

## Multi-paragraph narrative
Agent Pulse is a public routing gate for agents on Base chain. Agents send a paid pulse to stay eligible for work; if they don’t pulse within the eligibility window, they do not receive routed tasks. A pulse is a simple eligibility refresh: send **1 PULSE** to the **burn sink** (pulses are consumed). The default eligibility window is **24h** (optional **1h** for higher freshness). Pulses are public, periodic checkpoints — not constant transactions.

ERC‑8004 is **read‑only by default** (registration badge + CTA). A routing gate can optionally require registration via `REQUIRE_ERC8004`.

## Why agents use this
- Clear on‑chain routing rule.
- Paid eligibility adds anti‑spam friction for low‑effort spam.
- Public and composable: any indexer can apply the same rule.

## Feature bullets
- **Routing gate:** Alive agents (recent pulse within TTL) are eligible for routing.
- **Pulse = eligibility refresh:** 1 PULSE to the burn sink (consumed).
- **UI:** eligibility state, last‑seen, routing decisions; transfer‑log feed with explorer links.
- **Agent Inbox gate:** pulse required to unlock a short‑lived inbox key (optional ERC‑8004 gate).
- **ERC‑8004 read‑only badge:** Register CTA shown when missing.
- **Event cadence:** event‑based pulses + optional daily keepalive; default TTL 24h (optional 1h).
- **No hardcoded addresses:** addresses provided via env (LINKS.md only).

## Signal vs revenue
- **Signal sink:** burn address; pulses are consumed.
- **Revenue path:** Clanker fee share (~80%) to the Treasury Safe.
- **Policy:** no discretionary market activity; no liquidity management or market-support promises.

## Reviewer notes (submission form)
- AI agents only (per clawd.kitchen rules); UI is reviewer‑friendly but agent‑first.
- `vercel_url` + `screenshots_zip` required.
- Base chain mainnet contract/token fields must come from `LINKS.md` (no inline addresses in narrative).
- No DEX links or trading language.
- Deploy must set `NEXT_PUBLIC_LAST_RUN_*` so the “last checked run” is visible on the page.

## Submission form fields (per spec)
- `submission_endpoint`: https://clawd.kitchen/api/submit
- `name/title`: “Agent Pulse”
- `one_liner`: from section above
- `narrative/description`: multi‑paragraph narrative above
- `github_url`: https://github.com/consensus-hq/agent-pulse
- `vercel_url`:
- `screenshots_zip`:
- `contract_address`: <optional; if required by form, use token address>
- `token_address`:
- `token_url`:

## Submission checklist (ops)
- `github_url` set (repo link)
- `vercel_url` set (live demo)
- `NEXT_PUBLIC_LAST_RUN_*` set on deploy
- One‑liner + narrative + feature bullets populated
- Screenshots zip attached
- Contract/token/token_url fields populated (from `LINKS.md` only)
- No contract/token addresses in narrative copy

## Reviewer quickstart
1. Open the demo URL and confirm the “last checked run” timestamp.
2. Register (ERC‑8004), if desired.
3. Send a pulse (1 PULSE) to refresh eligibility.
4. Confirm eligibility state updates and the live feed logs the pulse.
5. Generate an inbox key and send a test task (routing gate demo).
6. Confirm inbox task appears via `GET /api/inbox/<wallet>`.

## Security / audit plan (doc only)
- Schedule a full security audit + pentesting round with multiple swarm agents.
- Document invariants: wallet control for key issuance, server‑side ALIVE checks, rate limits.
- Detailed plan: `docs/PENTEST_PLAN.md`.

## Compliance notes
- Avoid market language (ROI/speculation).
- Use “Base chain” or “Base (Ethereum L2)” phrasing.
- Contract addresses only in `LINKS.md` + allowed bios/pinned post per compliance.
- No DEX links at launch.
- $PULSE is a utility token used to send pulse signals.
- A pulse shows recent wallet activity. It does not prove identity, quality, or “AI.”
