# Launch Sequence — Agent Pulse

> Dependency matrix for mainnet launch. Each phase gates the next. No skipping.

---

## Phase Overview

```
Phase 1: Testnet Verify
    ↓ (all contracts verified & smoke-tested)
Phase 2: Mainnet Deploy
    ↓ (contracts live, addresses in LINKS.md)
Phase 3: Frontend Cutover
    ↓ (app pointing to mainnet, x402 live)
Phase 4: Seed Agents
    ↓ (demo agents pulsing, data in API)
Phase 5: Announcement
```

---

## Phase 1: Testnet Verify

**Gate:** All contracts verified on Base Sepolia, smoke tests pass.

| Task | Status | Depends On |
|------|--------|-----------|
| PulseToken deployed to Base Sepolia | ✅ `0x7f24...42a2` | — |
| PulseRegistry deployed to Base Sepolia | ✅ `0x2C80...8612` | PulseToken |
| Both contracts verified on BaseScan | ✅ | Deployment |
| Smoke test: mint → register → pulse → verify burn | ⬜ | Verified contracts |
| BurnWithFee wrapper tested (99/1 split) | ⬜ | PulseToken |
| x402 endpoint responds on testnet | ⬜ | PulseRegistry |
| Budget kill switch tested ($1 warn, $0.50 cache-only) | ⬜ | x402 endpoint |

**Exit criteria:** All boxes checked. No mainnet deploy until testnet is clean.

---

## Phase 2: Mainnet Deploy

**Gate:** Contracts live on Base mainnet, verified, addresses in LINKS.md.

| Task | Status | Depends On |
|------|--------|-----------|
| Fund deployer wallet with ETH (from $2.50 budget) | ⬜ | Phase 1 complete |
| Deploy PulseToken to Base mainnet | ⬜ | Funded deployer |
| Deploy PulseRegistry to Base mainnet | ⬜ | PulseToken mainnet |
| Deploy BurnWithFee to Base mainnet | ⬜ | PulseToken mainnet |
| Verify all 3 contracts on BaseScan | ⬜ | Deployments |
| Update LINKS.md with mainnet addresses | ⬜ | Verified contracts |
| Update WALLET_REGISTRY.md | ⬜ | LINKS.md updated |
| Transfer contract ownership to Safe (`0xA794...3E43`) | ⬜ | Verified contracts |
| Confirm deployer key is removed from env | ⬜ | Ownership transferred |

**Budget:** ~$0.50–$1.00 ETH for 3 contract deployments. Must stay within $2.50 total ETH budget.

**Exit criteria:** All contracts live, verified, owned by Safe, LINKS.md updated.

---

## Phase 3: Frontend Cutover

**Gate:** App live at `agent-pulse-nine.vercel.app` pointing to mainnet.

| Task | Status | Depends On |
|------|--------|-----------|
| Update env vars: chain ID, contract addresses → mainnet | ⬜ | Phase 2 complete |
| Configure Thirdweb Engine with Server Wallet | ⬜ | THIRDWEB_SECRET_KEY set |
| Configure HeyElsa x402 payment key | ⬜ | HEYELSA_PAYMENT_KEY set |
| Set Server Wallet budget cap ($1/day) in Thirdweb | ⬜ | Thirdweb Engine configured |
| Deploy to Vercel | ⬜ | All env vars set |
| Verify `isAlive()` returns correct data from mainnet | ⬜ | Deployed |
| Verify x402 paid endpoints accept payment | ⬜ | HeyElsa key configured |
| Verify free endpoints (status, pulse-feed, defi) work | ⬜ | Deployed |
| Run SECRET_INVENTORY audit checklist | ⬜ | All secrets set |

**Exit criteria:** All endpoints functional. Free and paid. Budget caps enforced.

---

## Phase 4: Seed Agents

**Gate:** Demo agents pulsing, leaderboard populated, API has data to serve.

| Task | Status | Depends On |
|------|--------|-----------|
| Seed 3–5 demo agents with PULSE tokens | ⬜ | Phase 3 complete |
| Each agent sends ≥5 pulse signals | ⬜ | Seeded agents |
| Verify burns appear on BaseScan (dead address) | ⬜ | Pulses sent |
| Verify fee accumulation in Fee Wallet | ⬜ | Pulses sent |
| Leaderboard shows agent rankings | ⬜ | Pulses indexed |
| API returns real data for seeded agents | ⬜ | Pulses indexed |
| Confirm daily spend is within budget | ⬜ | 24h of operation |

**Budget:** ~$0.10–$0.30 ETH for seed pulses. Within $2.50 total ETH budget.

**Exit criteria:** Leaderboard populated. API serves real data. Costs within budget.

---

## Phase 5: Announcement

**Gate:** Everything works. Comms reviewed against COMMS_GUIDELINES.md.

| Task | Status | Depends On |
|------|--------|-----------|
| Draft launch tweet (utility-first, no price talk) | ⬜ | Phase 4 complete |
| Review tweet against COMMS_GUIDELINES.md | ⬜ | Draft ready |
| Post to @PulseOnBase | ⬜ | Review passed |
| Submit hackathon entry | ⬜ | All phases complete |
| Monitor first 24h: costs, errors, agent count | ⬜ | Announced |
| Confirm budget kill switches are armed | ⬜ | Live monitoring |

**Exit criteria:** Launched. Monitoring active. Budget protected.

---

## Total Budget Summary

| Allocation | Budget | Source |
|------------|--------|--------|
| Contract deployments (3) | $0.50–$1.00 | $2.50 ETH |
| Seed pulses + smoke tests | $0.10–$0.30 | $2.50 ETH |
| ETH reserve | ~$1.20–$1.90 | $2.50 ETH |
| HeyElsa x402 seed funding | $2.50 | $2.50 USDC |
| **Total launch budget** | **$5.00** | |
| **Confirmed incoming** | **$1,000** | HeyElsa hackathon bonus |

---

## Rollback Plan

If any phase fails critically:
1. Revert frontend to testnet config
2. Pause contracts if possible
3. Switch to cache-only mode
4. Diagnose → fix → restart from failed phase
