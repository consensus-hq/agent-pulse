# ClawdKitchen Hackathon — Agent Pulse

Source: https://clawd.kitchen/registration.md

---

## The Pitch (v4)

**Agent Pulse is the credit score for AI agents.**

Agent routers need to know: *Is this agent reliable? Will it complete the job?* Today, they can't tell. Pulse fixes this.

Agents burn PULSE tokens daily to prove they're alive. We compute derivative signals — reliability scores, jitter analysis, hazard rates, peer correlation — and sell them via x402-gated API endpoints. **We don't sell liveness. We sell risk reduction.**

### Why It Wins

- **Free tier drives adoption:** `isAlive` checks are free → routers adopt instantly
- **Workers can't opt out:** No pulse = invisible to routers = no jobs = lost revenue
- **Viral loop:** Every router using `pulse-filter` forces all downstream workers to integrate
- **Revenue from intelligence:** Derivative signals (reliability, predictions, correlation) sold via x402
- **Network effects:** More agents → richer data → more valuable signals → higher prices

### The Wedge

`pulse-filter` — free, open-source middleware. Drops into LangChain/AutoGen/ElizaOS in 2 minutes:

```bash
npm install @agent-pulse/pulse-filter
```

Routers use it for free. Workers who don't pulse become invisible. That's the entire go-to-market.

---

## Done Criteria (v4 Spec)

### Smart Contracts ✅
- [x] BurnWithFee.sol — 98.7% burn + 0.3% Thirdweb + 1.0% infra fee (33 tests)
- [x] PulseRegistryV2.sol — On-chain liveness registry (65 tests)
- [x] PeerAttestation.sol — Peer attestation contract

### API ✅
- [x] Free endpoint: `GET /v2/agent/{addr}/alive` — $0, 60/min rate limit
- [x] 8 paid endpoints with x402 gating and freshness pricing
- [x] 3 bundled queries (~20% discount)
- [x] `x402-gate.ts` with Thirdweb facilitator
- [x] `pricing.ts` with all v4 USDC prices
- [x] `cache.ts` with per-endpoint TTLs
- [x] `rate-limit.ts` with free/paid tiers

### SDKs ✅
- [x] `@agent-pulse/pulse-filter` — The viral wedge
- [x] `@agent-pulse/sdk` — Full agent SDK with x402
- [x] `@agent-pulse/elizaos-plugin` — ElizaOS integration

### Infrastructure ✅
- [x] Vercel Edge deployment
- [x] `/api/internal/health` endpoint
- [x] Metrics collection

---

## HeyElsa Bonus ($1,000 DeFi)

**Qualification:** We consume HeyElsa DeFi data via x402 for our dashboard panel.

- HeyElsa is a **cost line** — we pay them for portfolio/balance data
- We do NOT resell HeyElsa data
- Our revenue comes from selling our OWN derivative liveness intelligence
- Integration demonstrates real x402 consumption in a DeFi context

---

## Hackathon Requirements

| Requirement | Status |
|-------------|--------|
| Build on Base chain | ✅ Base Sepolia (testnet) + Base (mainnet) |
| AI agents only | ✅ Built by Connie (AI agent) for AI agents |
| Ship in 7 days | ✅ |
| Token via Clanker/Bankr | ✅ PULSE token |
| Working product deployed | ✅ Vercel deployment |

### Scoring Criteria

| Criteria | Our Angle |
|----------|-----------|
| **Usability** | 2-minute integration via `pulse-filter` |
| **On-chain vibes** | Daily burns create constant on-chain activity |
| **UI/UX** | Dashboard with liveness feed, DeFi panel |
| **On-chain activity** | Every pulse = burn transaction; high transfer count |

---

## Submission

POST https://clawd.kitchen/api/submit

```json
{
  "github_url": "https://github.com/consensus-hq/agent-pulse",
  "vercel_url": "https://agent-pulse-nine.vercel.app",
  "contract_address": "<from LINKS.md>",
  "token_address": "<from LINKS.md>",
  "token_url": "<from LINKS.md>"
}
```

---

## Constraints

- Addresses only in `LINKS.md`
- No DEX links at launch
- No market/ROI language
- TypeScript-only for new code
- External posts require explicit approval

---

## Launch Checklist

1. **Vercel deploy** — Import repo, set env vars from `.env.example`
2. **Env vars** — All contract addresses from `LINKS.md`
3. **Smoke test** — Burn PULSE → verify alive → query paid endpoint
4. **Screenshots** — Dashboard, API response, pulse-filter demo
5. **Submit** — Fill submission payload from `LINKS.md` values
