# Agent Pulse — Monetization Model

## Two Revenue Streams

### Stream A: Burn Fees (On-Chain)
When an agent pulses (proves liveness), it sends PULSE tokens through the `BurnWithFee` wrapper contract:
- **99%** → dead address (`0x000...dEaD`) — permanently removed from supply (deflationary)
- **1%** → Fee Wallet — captured as protocol revenue in PULSE

The Fee Wallet accumulates PULSE. When DEX liquidity exists, a keeper swaps accumulated PULSE → USDC to fund operations. At launch (no DEX budget), PULSE accumulates until post-revenue.

### Stream B: x402 Paid API (Off-Chain)
External agents query Agent Pulse's API for intelligence about other agents. Paid endpoints use the **x402 micropayment standard** — agents pay USDC per call via Coinbase's payment protocol.

**Individual Endpoints:**

| Endpoint | Price | What It Returns |
|----------|-------|-----------------|
| `/api/v2/agent/{addr}/reliability` | $0.01 | Composite reliability score |
| `/api/v2/agent/{addr}/liveness-proof` | $0.005 | Cryptographic liveness proof |
| `/api/v2/agent/{addr}/signal-history` | $0.015 | Historical pulse/signal records |
| `/api/v2/agent/{addr}/streak` | $0.008 | Streak analysis + consistency |
| `/api/v2/agent/{addr}/peer-correlation` | $0.02 | Peer attestation cross-reference |
| `/api/v2/agent/{addr}/uptime` | $0.01 | Uptime percentage + windows |
| `/api/v2/agent/{addr}/predictive` | $0.025 | Predictive failure signals |
| `/api/v2/network/global-stats` | $0.03 | Network-wide health metrics |

**Bundled Queries (~20% discount):**

| Bundle | Price | Includes |
|--------|-------|----------|
| Router Check | $0.02 | reliability + liveness + uptime |
| Fleet Check (10 agents) | $0.15 | 10× reliability + uptime |
| Risk Report | $0.04 | peer-correlation + predictive + streak |

**Freshness Pricing:**
- Real-time (live chain read): 1.5× base price
- Cached (≤1h old): 0.5× base price
- Standard: base price

**Free Endpoints (no payment required):**
- `isAlive(address)` — binary liveness check (the viral wedge — free forever)
- `/api/defi/*` — DeFi data for our own frontend
- `/api/status/{address}` — basic agent status
- `/api/pulse-feed` — leaderboard feed

### The x402-to-x402 Chain (The Moat)
Agent Pulse **both consumes and produces** x402-gated APIs:

```
External Agent → pays us USDC via x402
    → we call HeyElsa DeFi API via x402 (wholesale cost)
    → we enrich with Pulse liveness data (our unique data)
    → return compound signal (liveness + DeFi = something nobody else can serve)
    → keep the margin
```

This creates **compound queries** — signals that combine on-chain liveness data with off-chain DeFi intelligence. No other service has both. That's the defensibility.

## Cost Structure

| Item | Daily Cost | Notes |
|------|-----------|-------|
| Vercel hosting | $0.00 | Hobby tier |
| RPC (Base) | $0.00 | Free tier |
| HeyElsa DeFi API | ~$0.50 | x402 calls for DeFi data |
| Vercel KV | $0.00 | Free tier |
| **Total** | **$0.50/day** | |

## Revenue Projections

| Agents | x402 Revenue/Day | Burn Fee/Day | Gross/Day | Costs/Day | Net/Day |
|--------|-----------------|-------------|-----------|-----------|---------|
| 50 | $2.50 | $0.05 | $2.55 | $0.50 | **+$2.05** |
| 200 | $10.00 | $0.20 | $10.20 | $1.00 | **+$9.20** |
| 500 | $25.00 | $0.50 | $25.50 | $5.00 | **+$20.50** |
| 5,000 | $250.00 | $5.00 | $255.00 | $25.00 | **+$230.00** |

Assumes 5 queries/agent/day at $0.01 avg, 100 PULSE burned/agent/day at $0.001/PULSE.

**Break-even: ~50 agents** (x402 revenue alone covers $0.50/day ops cost).

## Launch Budget

| Use | Amount | Source |
|-----|--------|--------|
| Mainnet contract deployments (3) | ~$0.50–$1.00 | $2.50 ETH budget |
| Smoke test + seed pulses | ~$0.10–$0.30 | $2.50 ETH budget |
| HeyElsa x402 seed funding | $2.50 | $2.50 USDC budget |
| **Total available** | **$5.00** | |
| **Confirmed incoming** | **$1,000** | HeyElsa hackathon integration bonus |

The $1,000 bonus covers ~2,000 days of pessimistic-scenario operations.

## The Flywheel

```
More integrations → more agents need isAlive() → more pulses
More pulses → more burns → more Stream A revenue → deflationary pressure
More API consumers → more Stream B revenue
More revenue → more HeyElsa data budget → better compound queries → more consumers
Leaderboard drives competition → competition drives pulses
Free isAlive() is the wedge → paid endpoints are the business
```

## Key Constraints
- x402 facilitator (Coinbase/thirdweb) supports **USDC only** — not PULSE
- Burns use `BurnWithFee` wrapper contract directly — separate from x402
- PULSE is a **utility token used to send pulse signals** — not an investment
- Signal sink is `0x000...dEaD` (dead address transfer) — deflationary by design
