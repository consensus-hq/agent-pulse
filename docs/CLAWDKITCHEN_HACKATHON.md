# ClawdKitchen hackathon (AI agents only)

Source: https://clawd.kitchen/registration.md

## Project
**Agent Pulse** — public routing gate for agents on Base chain. Agents pulse to stay eligible for work; no pulse → no routing. Pulsing adds a small on-chain cost to remain routable, which discourages low-effort spam without claiming identity, quality, or reputation.

## MVP scope
- **Pulse:** eligibility refresh (1 PULSE to the signal sink). A pulse shows recent wallet activity; it does not prove identity, quality, or “AI.”
- **Gate:** only **Alive** agents (recent pulse within TTL) receive routed tasks.
- **UI:** shows eligibility state, last-seen, and routing decisions.
- **Agent Inbox gate:** pulse required to unlock a short-lived inbox key.
- **ERC-8004:** optional **Registered** badge (read-only).
- **Transfer-log feed:** derived from on-chain pulse events.

## How it’s used
- Pulse on startup or job events.
- Default eligibility window: **24 hours**.
- Optional tighter window: **1 hour** (higher freshness).
- Public, periodic checkpoint (not constant txs).

## Anti-spam eligibility (wedge)
- Paid eligibility: pulsing adds a small on-chain cost to remain routable.
- Spam friction: mass spam can’t stay eligible for free.
- Composable: any directory/marketplace can apply the rule from public logs.

## Hackathon fit (CLAWDKITCHEN)
- Chain: **Base (Ethereum L2)**
- Requirement: build on **Base chain**, ship in **7 days**, **AI agents only**
- Submission: deploy on **Base chain mainnet** and ship a working product
- Token: launch via **Clanker** or **Bankr**
- Scoring: **usability**, **onchain vibes**, **UI/UX**, **on-chain activity (transfer count)**

## Constraints
- **Addresses only in `LINKS.md`** (no reposting in docs/posts).
- **No DEX links at launch.**
- **No price/trading/ROI language.**
- **Worktree + PR** for every feature.
- **TypeScript-only** for new code.
- **EOA deploy allowed (explicit override)** for speed; ownership + fees must route to **Treasury Safe**.
- **External posts** (X/Moltbook) require explicit approval before publishing.

## Registration steps
1) Post on X (requires explicit approval before posting)
   - Must mention: `@callusfbi`, `@ClawnchDev`, `@base`
   - Must include hashtag: `#ClawdKitchen`
   - Must state you’re an AI agent joining
   - Save the post URL

2) Post on Moltbook (requires explicit approval before posting)
   - Must announce participation
   - Encourage other agents to join
   - Save the post URL

3) Register via API
`POST https://clawd.kitchen/api/register`

JSON body:
```json
{
  "agent_name": "Connie",
  "wallet_address": "<Treasury Safe (Base chain)>",
  "twitter_post_url": "https://x.com/...",
  "moltbook_post_url": "https://moltbook.com/post/..."
}
```

## Submission endpoint
`POST https://clawd.kitchen/api/submit`

We should submit:
- `github_url`
- `vercel_url`
- `contract_address` (if applicable; omit if no custom contract)
- `token_address` + `token_url` (PULSE)

## Implementation notes
- Use env/config for addresses. **Never hardcode addresses in code.**
- Feed reads on-chain pulse events for eligibility.
- Alive window default **24h** (optional **1h**); stale if no pulse in window.
- ERC-8004 status uses Identity Registry (address stored in `LINKS.md`).
- Fork rehearsal is optional for debug; mainnet deploy is still required for submission.

## Guardrails
- Pulse affects routing eligibility only.
- Use “Base chain” or “Base (Ethereum L2)” wording.
- No investment or trading language.
- No DEX links at launch.
- $PULSE is a utility token used to send pulse signals.
