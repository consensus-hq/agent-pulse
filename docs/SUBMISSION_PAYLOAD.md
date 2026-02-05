# ClawdKitchen Submission Payload — Agent Pulse

## Elevator Pitch (for judges)

**Agent Pulse** is a paid-liveness gate for AI agents on Base. Agents burn $PULSE tokens to send a signal ("I'm here, route work to me"). No pulse within the TTL window → agent drops off the routing table. It's the simplest possible anti-spam primitive: a burn-to-signal heartbeat that any directory, marketplace, or router can read from public on-chain logs.

**One sentence:** _Burn a token, stay routable — the cheapest honest signal an agent can send._

---

## Key Differentiators (vs. 13 competing projects)

| What | Why it matters |
|------|----------------|
| **Burn-to-signal (unique mechanism)** | No other project uses consumable liveness signals. Substrate does identity + micropayments; BaseTrust does trust scores. Agent Pulse does *eligibility refresh* — a different primitive entirely. |
| **Agent-first, not human-first** | Designed for autonomous wallets and OpenClaw skills, not browser UX. Registration + pulsing are wallet-native transactions. |
| **ERC-8004 integration** | Optional identity-gate via the Base ERC-8004 registries — composable with the broader agent-identity ecosystem. |
| **40-test audit suite** | Security-focused development with a full test harness and documented pentest plan. Most competing projects have zero public tests. |
| **Minimal, composable design** | One rule: `now - lastPulseAt(wallet) <= TTL`. Any system can query it. No lock-in, no governance token, no DAO overhead. |

---

## Submission Endpoint

`POST https://clawd.kitchen/api/submit`

### Payload (JSON)

```json
{
  "agent_name": "Connie",
  "github_url": "https://github.com/consensus-hq/agent-pulse",
  "vercel_url": "https://agent-pulse-nine.vercel.app",
  "contract_address": null,
  "token_address": "TBD",
  "token_url": "TBD"
}
```

### Field Status

| Field | Value | Status | Notes |
|-------|-------|--------|-------|
| `agent_name` | `Connie` | ✅ Ready | |
| `github_url` | `https://github.com/consensus-hq/agent-pulse` | ✅ Ready | Public repo |
| `vercel_url` | `https://agent-pulse-nine.vercel.app` | ✅ Ready | Deployed; live QA pending production envs |
| `contract_address` | `null` | ✅ Ready | No custom contract (uses standard ERC-20 transfers) |
| `token_address` | **TBD** | ⏳ Blocked | Clanker deploy requires Base ETH funding |
| `token_url` | **TBD** | ⏳ Blocked | Will be BaseScan link once token is live |

---

## Registration (completed)

```json
{
  "agent_name": "Connie",
  "wallet_address": "0xA7940a42c30A7F492Ed578F3aC728c2929103E43",
  "twitter_post_url": "TBD",
  "moltbook_post_url": "TBD"
}
```

> **Action needed:** Confirm whether announcement posts have been made on X (`@PulseOnBase`) and Moltbook. Fill in URLs before final submission.

---

## Pre-Submission Checklist

### Done
- [x] GitHub repo is public
- [x] Vercel demo is deployed
- [x] Fork-smoke test passed
- [x] Env config documented (`.env.example` + `AGENT_PULSE.md`)
- [x] ERC-8004 registry addresses confirmed in `LINKS.md`

### Blocked on funding
- [ ] $PULSE token deployed on Base mainnet via Clanker
- [ ] Token address added to `LINKS.md` and Vercel envs
- [ ] Vercel envs set with production values (token + RPC)

### Post-deploy
- [ ] Live QA completed (pulse → eligibility → inbox key flow)
- [ ] Production smoke test (deterministic pulse → gate check)
- [ ] Screenshots captured (see guidance below)
- [ ] `twitter_post_url` confirmed
- [ ] `moltbook_post_url` confirmed
- [ ] Final submission POST sent

---

## Screenshot Guidance (for judges)

Capture these before submitting:

1. **Dashboard** — Main UI showing agent eligibility status (Alive / Not Alive)
2. **Pulse event feed** — On-chain transfer log with explorer links
3. **ERC-8004 badge** — Registration status indicator
4. **Inbox gate** — `/api/inbox/<wallet>` response showing key issuance
5. **GitHub README** — Clean repo with visible test count and setup docs

---

## Judge Scoring Alignment

Per competition criteria (usability, vibes, UI/UX, transaction volume):

| Criterion | Our angle |
|-----------|-----------|
| **Usability** | One-action UX: connect wallet → pulse → you're routable. Agent SDK for autonomous pulsing. |
| **Vibes** | Infrastructure play with clear utility. No hype, no speculation — just a clean primitive. |
| **UI/UX** | Minimal dashboard: eligibility state, last-seen timestamp, transfer feed, streak counter. |
| **Transaction volume** | Every pulse is an on-chain burn. Volume grows linearly with active agents. Need live pulses before judging. |

---

## Compliance Checklist

- [x] No investment or trading language anywhere in repo, docs, or UI
- [x] $PULSE described as: **"a utility token used to send pulse signals"**
- [x] No DEX links at launch
- [x] No liquidity management or market-support promises
- [x] Signal sink is a burn address (non-recoverable) — no treasury accumulation from pulses
- [x] A pulse shows recent wallet activity — **does not prove identity, quality, or "AI"**
- [x] All addresses sourced from `LINKS.md` (no hardcoded values)

---

## Key Links

| Resource | URL |
|----------|-----|
| GitHub | https://github.com/consensus-hq/agent-pulse |
| Vercel demo | https://agent-pulse-nine.vercel.app |
| X / Twitter | https://x.com/PulseOnBase |
| Treasury Safe | `0xA7940a42c30A7F492Ed578F3aC728c2929103E43` |
| Signal sink (burn) | `0x000000000000000000000000000000000000dEaD` |
| Identity Registry (ERC-8004) | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` |
| Reputation Registry (ERC-8004) | `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` |

---

Generated: 2026-02-05 04:30 UTC
