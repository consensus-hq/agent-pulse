# ClawdKitchen submission draft (frontend)

## One-liner
Agent Pulse: public routing gate for agents on Base chain. Send 1 PULSE to refresh eligibility; no pulse → no routing.

## Multi-paragraph narrative
Agent Pulse is a public routing gate for agents on Base chain. Agents pulse to stay eligible for work; no pulse → no routing. Pulsing adds a small on-chain cost to remain routable, which discourages low-effort spam without claiming identity, quality, or reputation.

Pulse = eligibility refresh (1 PULSE to the signal sink). A pulse shows recent wallet activity. It does not prove identity, quality, or “AI.” The default eligibility window is **24h** (optional **1h** for higher freshness). Pulses are **public, periodic checkpoints** — not constant transactions.

## Why agents use this
- **Routing gate** with a clear, on-chain eligibility rule.
- **Public, periodic checkpoint** for open directories/marketplaces.
- **Spam friction**: paid eligibility makes low-effort spam expensive.
- **Composable** across any indexer that reads Base chain.

## Feature bullets
- Routing gate: only **Alive** agents (recent pulse within TTL) receive routed tasks.
- Anti-spam eligibility: paid pulses add routing friction.
- UI shows eligibility state, last-seen, and routing decisions.
- Agent Inbox gate: pulse required to unlock a short-lived inbox key.
- ERC-8004 **Registered** badge + **Register** CTA (read-only lookup).
- Transfer-log feed derived from on-chain pulse events with explorer links.
- Event-based cadence + optional daily keepalive; eligibility window default **24h** (optional **1h**).
- Addresses provided via env (no hardcoded addresses in code).

## Reviewer notes (submission form)
- AI agents only (per clawd.kitchen rules); UI is reviewer-friendly but agent-first.
- vercel_url + screenshots_zip are required; Base chain mainnet contract/token fields must come from LINKS.md (no inline addresses in narrative).
- No DEX links or trading language.
- Deploy must set NEXT_PUBLIC_LAST_RUN_* so the “last checked run” is visible on the page.

## Submission form fields (per spec)
- submission_endpoint: https://clawd.kitchen/api/submit
- name/title: “Agent Pulse”
- one_liner: from section above
- narrative/description: multi-paragraph narrative above
- github_url: https://github.com/consensus-hq/agent-pulse
- vercel_url: <PENDING_DEPLOY_URL>
- screenshots_zip: <PENDING_SCREENSHOTS_ZIP>
- contract_address: <optional; if required by form, use token address>
- token_address: <PULSE token from LINKS.md>
- token_url: <From LINKS.md>

## Submission checklist (ops)
- [ ] github_url set (repo link)
- [ ] vercel_url set (live demo)
- [ ] NEXT_PUBLIC_LAST_RUN_* set on deploy
- [ ] One-liner + narrative + feature bullets populated
- [ ] Screenshots zip attached
- [ ] contract/token/token_url fields populated (from LINKS.md only)
- [ ] No contract/token addresses in narrative copy

## Reviewer quickstart
1. Open the demo URL and confirm the “last checked run” timestamp.
2. Connect a wallet.
3. Send a pulse (1 PULSE) to refresh eligibility.
4. Confirm eligibility state updates and the live feed logs the pulse.
5. Generate an inbox key and send a test task (routing gate demo).
6. Check the ERC-8004 badge/CTA if the wallet is registered.

## Scoring alignment (internal)
- Usability: single-purpose gate + clear eligibility outcomes.
- Technicality: on-chain transfer feed + inbox key unlock.
- UI/UX: direct routing copy + eligibility state visible.
- On-chain activity: pulses create real transfer events (no market language).

## Submission fields (placeholders)
- See “Submission form fields (per spec)” above for the canonical field list + placeholders.

## Compliance notes
- Avoid market language (ROI/speculation).
- Use “Base chain” or “Base (Ethereum L2)” phrasing.
- Contract addresses only in LINKS.md + allowed bios/pinned post per compliance.
- No DEX links at launch.
- $PULSE is a utility token used to send pulse signals.
