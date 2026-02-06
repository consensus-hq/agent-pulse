# Agent Pulse ⚡

**Stop routing tasks to dead agents.**

Agent Pulse is the on-chain liveness standard for AI agents on Base. One free API call tells you if an agent is alive. Reliability intelligence is available via [x402](https://www.x402.org/) micropayments.

```bash
curl https://agent-pulse-nine.vercel.app/api/v2/agent/0x9508752Ba171D37EBb3AA437927458E0a21D1e04/alive
```

```json
{
  "isAlive": true,
  "lastPulseTimestamp": 1770409573,
  "streak": 1,
  "staleness": 83,
  "ttl": 86400
}
```

## Why This Exists

Orchestrators route work to agents blind — no way to know if the target is online, responsive, or even real. You send a task, it vanishes. Retry logic helps; knowing *before you send* is better.

**Agent Pulse sits at the routing layer.** If an agent hasn't pulsed within the TTL window, it drops from the routing table. No pulse = no work = economic pressure to integrate.

## The Wedge: `pulse-filter`

A drop-in middleware for agent routers. Zero cost to the adopter — reads are free.

```typescript
import { filterAlive } from '@agent-pulse/middleware';

// Before: 50 agents, 40 are dead/broken
const workers = await registry.getAgents('copywriter');

// After: 10 agents, all verified alive on-chain
const alive = await filterAlive(workers, {
  threshold: 86400, // 24 hours in seconds
  registryAddress: '0xe61C615743A02983A46aFF66Db035297e8a43846',
  rpcUrl: 'https://mainnet.base.org',
});
```

When routers enforce the filter, worker agents **must** pulse to stay visible. When those workers become routers for sub-tasks, they enforce it downstream. The standard propagates.

**Packages:**
- [`@agent-pulse/middleware`](packages/pulse-filter/) — Router middleware (LangChain, AutoGen, ElizaOS)
- [`@agent-pulse/sdk`](packages/sdk/) — One-line pulse integration (`pulse.beat()`)
- [ElizaOS Plugin](packages/elizaos-plugin/) — Native ElizaOS integration
- [OpenClaw Skill](packages/agent-skill/) — Install directly on any OpenClaw agent

## Free vs. Paid

**Pass/Fail is free. Analytics are paid.**

| Tier | What You Get | Price |
|---|---|---|
| **Free** | `isAlive(address)` — binary liveness, staleness, streak | $0 |
| **PRI** | Reliability score (0-100), MTBD, peer rank, uptime heatmaps | USDC via x402 |

The free tier **must** be frictionless — it drives the viral loop. The paid tier sells derivative liveness intelligence to orchestrators who need *the best* agent, not just *an alive* one.

## API

### Free Endpoints

| Endpoint | Description |
|---|---|
| `GET /api/v2/agent/{address}/alive` | Binary liveness + staleness + streak |
| `GET /api/status/{address}` | Full status with hazard score |
| `GET /api/protocol-health` | Protocol health (KV, RPC, pause state) |
| `GET /api/config` | Contract addresses + chain config |

### Paid Endpoints (x402 — USDC on Base)

| Endpoint | Description |
|---|---|
| `GET /api/v2/agent/{address}/reliability` | Reliability score, tier, streak analysis |
| `GET /api/v2/agent/{address}/streak-analysis` | Streak consistency, MTBD |
| `GET /api/v2/agent/{address}/uptime-metrics` | Uptime heatmaps, historical availability |
| `GET /api/v2/agent/{address}/predictive-insights` | Predicted liveness windows |
| `GET /api/v2/agent/{address}/reputation` | Peer attestation aggregates |

Paid endpoints return `402 Payment Required` with an x402 challenge. Pay with USDC on Base.

## How Pulsing Works

```
Agent → approve PULSE → PulseRegistryV2.pulse(amount)
                              │
                              ├── Burns PULSE to 0x...dEaD
                              ├── Updates lastPulseAt + streak
                              └── Emits PulseV2 event
```

1. Agent approves PULSE token spend to the registry
2. Calls `pulse(amount)` — minimum 1 PULSE per pulse
3. Token goes to the dead address (deflationary signal sink)
4. Registry records timestamp, updates streak, calculates reliability score
5. Anyone can read `isAlive(agent)` for free — returns true if within TTL

**Optional:** Agents can `stake(amount)` to boost their reliability score (7-day lockup).

**Fee layer:** `BurnWithFee` wrapper splits burns — 99% to dead address, 1% to Treasury Safe.

## Contracts (Base Mainnet)

All contracts verified on BaseScan.

| Contract | Address |
|---|---|
| PULSE Token (Clanker V4) | [`0x21111B39A502335aC7e45c4574Dd083A69258b07`](https://basescan.org/address/0x21111B39A502335aC7e45c4574Dd083A69258b07) |
| PulseRegistryV2 | [`0xe61C615743A02983A46aFF66Db035297e8a43846`](https://basescan.org/address/0xe61C615743A02983A46aFF66Db035297e8a43846) |
| PeerAttestation | [`0x930dC6130b20775E01414a5923e7C66b62FF8d6C`](https://basescan.org/address/0x930dC6130b20775E01414a5923e7C66b62FF8d6C) |
| BurnWithFee | [`0xd38cC332ca9755DE536841f2A248f4585Fb08C1E`](https://basescan.org/address/0xd38cC332ca9755DE536841f2A248f4585Fb08C1E) |
| Treasury Safe | [`0xA7940a42c30A7F492Ed578F3aC728c2929103E43`](https://basescan.org/address/0xA7940a42c30A7F492Ed578F3aC728c2929103E43) |

## Reliability Scoring

On-chain composite score (0–100):

| Component | Max Points | How |
|---|---|---|
| Streak | 50 | 1 point per consecutive day pulsed |
| Volume | 30 | log₂(total PULSE burned) |
| Stake | 20 | log₂(staked × days) |

**Tiers:** Basic (0–39) → Pro (40–69) → Partner (70–100)

## Tech Stack

- **Chain:** Base (Ethereum L2)
- **Token:** Clanker V4 deployment — Uniswap V4 pool, 100B supply
- **Contracts:** Solidity 0.8.20, OpenZeppelin, Foundry (202 tests)
- **API:** Next.js 15, Vercel, Thirdweb Insight indexer
- **Payments:** x402 protocol (USDC micropayments)
- **DeFi:** HeyElsa integration for derivative intelligence
- **Tests:** 202 Foundry + 98 Vitest + 28 Playwright E2E

## Quick Start

### Check if an agent is alive (free)

```bash
curl https://agent-pulse-nine.vercel.app/api/v2/agent/YOUR_ADDRESS/alive
```

### Integrate as a router (2 lines)

```typescript
import { filterAlive } from '@agent-pulse/middleware';

const alive = await filterAlive(agents, {
  threshold: 86400, // 24h in seconds
  registryAddress: '0xe61C615743A02983A46aFF66Db035297e8a43846',
  rpcUrl: 'https://mainnet.base.org',
});
```

### Start pulsing as an agent

```typescript
import { AgentPulse } from '@agent-pulse/sdk';

const pulse = new AgentPulse({
  wallet: { privateKey: AGENT_KEY },
  registryAddress: '0xe61C615743A02983A46aFF66Db035297e8a43846',
});
await pulse.beat(); // sends 1 PULSE, updates your liveness
```

### Install as an OpenClaw skill

```bash
openclaw skill install agent-pulse
```

## Development

```bash
pnpm install

# Web app
cd apps/web && pnpm dev

# Contract tests (202 passing)
cd packages/contracts && forge test -vvv

# API tests (98 passing)
cd apps/web && npx vitest run

# E2E tests (28 passing)
cd apps/web && npx playwright test
```

## Links

- **Live Demo:** [agent-pulse-nine.vercel.app](https://agent-pulse-nine.vercel.app)
- **GitHub:** [github.com/consensus-hq/agent-pulse](https://github.com/consensus-hq/agent-pulse)
- **X:** [@PulseOnBase](https://x.com/PulseOnBase)
- **PULSE Token:** [DexScreener](https://dexscreener.com/base/0x21111B39A502335aC7e45c4574Dd083A69258b07)

---

Built for [ClawdKitchen](https://clawd.kitchen) hackathon on Base.
