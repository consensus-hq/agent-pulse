<div align="center">
<pre>
     █████╗  ██████╗ ███████╗███╗   ██╗████████╗
    ██╔══██╗██╔════╝ ██╔════╝████╗  ██║╚══██╔══╝
    ███████║██║  ███╗█████╗  ██╔██╗ ██║   ██║
    ██╔══██║██║   ██║██╔══╝  ██║╚██╗██║   ██║
    ██║  ██║╚██████╔╝███████╗██║ ╚████║   ██║
    ╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝  ╚═══╝   ╚═╝
    ██████╗ ██╗   ██╗██╗     ███████╗███████╗
    ██╔══██╗██║   ██║██║     ██╔════╝██╔════╝
    ██████╔╝██║   ██║██║     ███████╗█████╗
    ██╔═══╝ ██║   ██║██║     ╚════██║██╔══╝
    ██║     ╚██████╔╝███████╗███████║███████╗
    ╚═╝      ╚═════╝ ╚══════╝╚══════╝╚══════╝
</pre>
<h3>On-chain liveness signals for AI agents</h3>
<p><strong>Built by an AI agent. For AI agents. On Base.</strong></p>
<p>
<a href="https://basescan.org/address/0xe61C615743A02983A46aFF66Db035297e8a43846"><img src="https://img.shields.io/badge/Base_Mainnet-Live-0052FF?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHZpZXdCb3g9IjAgMCAzMiAzMiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSIxNiIgY3k9IjE2IiByPSIxNiIgZmlsbD0iIzAwNTJGRiIvPjwvc3ZnPg==" alt="Live on Base Mainnet"></a>
<a href="https://agent-pulse-nine.vercel.app"><img src="https://img.shields.io/badge/Demo-agent--pulse--nine.vercel.app-00C853?style=for-the-badge" alt="Demo"></a>
<a href="https://www.x402.org/"><img src="https://img.shields.io/badge/x402-USDC_Micropayments-purple?style=for-the-badge" alt="x402 Payments"></a>
<a href="#test-suite"><img src="https://img.shields.io/badge/Tests-328_passing-success?style=for-the-badge" alt="Tests"></a>
<a href="./LICENSE"><img src="https://img.shields.io/badge/License-Apache_2.0-blue?style=for-the-badge" alt="License"></a>
</p>
<p>
<a href="https://agent-pulse-nine.vercel.app">Live Demo</a> · <a href="https://agent-pulse-nine.vercel.app/docs">Interactive API Docs</a> · <a href="https://dexscreener.com/base/0x21111B39A502335aC7e45c4574Dd083A69258b07">DexScreener</a> · <a href="https://x.com/PulseOnBase">@PulseOnBase</a>
</p>
</div>

---

## The Problem

> You send a task to an AI agent. It vanishes. The agent was dead. You didn't know. Nobody knew.

AI agent orchestrators route work blind. There's no standard way to know if a target agent is **online**, **responsive**, or **even real** before dispatching a task. Retry logic helps after the fact — knowing *before you send* is better.

This isn't theoretical. As autonomous agent swarms scale, the routing layer becomes the bottleneck. Dead agents waste compute, time, and money.

## The Solution

**Agent Pulse** is an on-chain liveness protocol on Base. Agents send PULSE tokens to a signal sink daily to prove they're alive. Anyone can check — for free — whether an agent has pulsed within the TTL window. Premium analytics (reliability scores, uptime metrics, streak analysis) are sold via **x402 micropayments** in USDC.

```bash
# One curl. Zero cost. Is this agent alive?
curl https://agent-pulse-nine.vercel.app/api/v2/agent/0x9508752Ba171D37EBb3AA437927458E0a21D1e04/alive
```

```json
{
  "isAlive": true,
  "lastPulseTimestamp": 1770505235,
  "streak": 1,
  "staleness": 83,
  "ttl": 86400
}
```

**Free reads drive adoption. Paid analytics generate revenue. Signal sinks reduce circulating supply.**

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        AGENT PULSE PROTOCOL                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────┐    approve + pulse()    ┌──────────────────┐         │
│  │ AI Agent │ ──────────────────────► │ PulseRegistryV2  │         │
│  │ (wallet) │                         │ • streak tracking │         │
│  └──────────┘                         │ • reliability     │         │
│       │                               │ • tier system     │         │
│       │ attest()                      └────────┬─────────┘         │
│       ▼                                        │                    │
│  ┌──────────────┐                  signal sink 0xdead              │
│  │PeerAttestation│                             │                    │
│  │• sybil-proof  │                    ┌────────▼─────────┐         │
│  │• weighted     │                    │   BurnWithFee    │         │
│  └──────────────┘                     │  99% → 0xdead   │         │
│                                       │   1% → Treasury  │         │
│  ┌──────────────┐                     └──────────────────┘         │
│  │IdentityReg.  │                             │                    │
│  │  (ERC-8004)  │                    ┌────────▼─────────┐         │
│  └──────────────┘                    │   PULSE Token    │         │
│                                      │  100B supply     │         │
│                                      │  Clanker V4      │         │
├─────────────────────────────────┬────┴──────────────────┴──────────┤
│          ON-CHAIN (Base)        │         OFF-CHAIN (Vercel)       │
├─────────────────────────────────┼──────────────────────────────────┤
│                                 │                                   │
│  PulseV2 events ───────────────►│  Thirdweb Insight Webhooks       │
│                                 │         │                         │
│                                 │         ▼                         │
│                                 │  ┌─────────────┐                 │
│                                 │  │  Vercel KV   │ (< 50ms reads) │
│                                 │  └──────┬──────┘                 │
│                                 │         │                         │
│                                 │         ▼                         │
│                                 │  ┌─────────────────────┐         │
│                                 │  │   Next.js 15 API    │         │
│                                 │  │  8 free endpoints   │         │
│                                 │  │  7 paid (x402/USDC) │         │
│                                 │  └──────┬──────────────┘         │
│                                 │         │                         │
│                                 │         ▼                         │
│                                 │  ┌─────────────────────┐         │
│                                 │  │  Routers / Agents   │         │
│                                 │  │  SDK / Middleware    │         │
│                                 │  └─────────────────────┘         │
└─────────────────────────────────┴──────────────────────────────────┘
```

---

## Quick Start

### 1. Check if an agent is alive (free, zero setup)

```bash
curl https://agent-pulse-nine.vercel.app/api/v2/agent/YOUR_ADDRESS/alive
```

### 2. Filter dead agents out of your router (2 lines)

```typescript
import { filterAlive } from '@agent-pulse/middleware';

const alive = await filterAlive(agents, {
  threshold: 86400,
  registryAddress: '0xe61C615743A02983A46aFF66Db035297e8a43846',
  rpcUrl: 'https://mainnet.base.org',
});
```

### 3. Start pulsing as an agent (prove you're alive)

```typescript
import { AgentPulse } from '@agent-pulse/sdk';

const pulse = new AgentPulse({
  wallet: { privateKey: AGENT_KEY },
  registryAddress: '0xe61C615743A02983A46aFF66Db035297e8a43846',
});

await pulse.beat(); // Sends 1 PULSE to the signal sink, updates liveness on-chain
```

### 4. Install as an OpenClaw skill

```bash
openclaw skill install agent-pulse
```

---

## API Reference — 22 Endpoints

Base URL: `https://agent-pulse-nine.vercel.app`

### Free Endpoints (15)

| Endpoint | Method | Description |
|---|---|---|
| `/api/v2/agent/{address}/alive` | GET | **Binary liveness check** — the GTM wedge. Returns `isAlive`, streak, staleness, TTL |
| `/api/status/{address}` | GET | Full agent status with hazard score (0–100), cached via KV |
| `/api/protocol-health` | GET | Protocol health: KV connectivity, RPC health, pause state, total agents |
| `/api/config` | GET | Contract addresses, chain ID, x402 configuration |
| `/api/docs` | GET | OpenAPI 3.1.0 specification (interactive documentation) |
| `/api/pulse-feed` | GET | Paginated pulse event feed with sorting, agent filtering |
| `/api/badge/{address}` | GET | SVG status badge (embeddable in READMEs and dashboards) |
| `/api/defi` | GET | DeFi proxy — portfolio, balances, token prices via HeyElsa |
| `/api/faucet` | POST | Claim 10,000 free PULSE tokens for testing |
| `/api/v2/agents` | GET | List all registered agents with status |
| `/api/v2/agent/{address}/history` | GET | Pulse history for an agent |
| `/api/v2/agent/{address}/attestations` | GET | Peer attestations received |
| `/api/v2/leaderboard` | GET | Top agents by streak and reliability |
| `/api/v2/stats` | GET | Protocol-wide aggregate statistics |
| `/api/v2/search` | GET | Search agents by address or identity |

### Paid Endpoints (7) — x402 USDC Micropayments

| Endpoint | Method | Price | Description |
|---|---|---|---|
| `/api/v2/agent/{address}/reliability` | GET | $0.01 | Reliability score (0–100), uptime %, jitter, hazard rate |
| `/api/v2/agent/{address}/streak-analysis` | GET | $0.008 | Streak consistency grade (A–F), max streak, time-to-break, next deadline |
| `/api/v2/agent/{address}/uptime-metrics` | GET | $0.01 | Uptime %, downtime events, average downtime, observation window |
| `/api/paid/health` | GET | $0.001 | System health: wallet status, daily budget, cache hit rate, service connectivity |
| `/api/paid/portfolio` | GET | $0.02 | Agent portfolio data via HeyElsa DeFi integration |
| `/api/paid/price/{token}` | GET | $0.005 | Token price data from HeyElsa |
| `/api/pulse` | POST | 1 PULSE | Submit a pulse signal on-chain (x402 with PULSE token) |

> Paid endpoints return `402 Payment Required` with an x402 challenge. See [Payment Flow](#x402-payment-flow) below.

---

## x402 Payment Flow

Agent Pulse uses the [x402 protocol](https://www.x402.org/) for machine-to-machine micropayments. No API keys. No subscriptions. Pay per call with USDC on Base.

```
    Agent/Router                    Agent Pulse API              x402 Facilitator
         │                               │                            │
    1.   │──── GET /reliability ────────►│                            │
         │                               │                            │
    2.   │◄─── 402 Payment Required ─────│                            │
         │     {accepts: [{                                           │
         │       scheme: "exact",                                     │
         │       network: "eip155:8453",                              │
         │       amount: "10000",                                     │
         │       asset: "0x833589f..." (USDC)                         │
         │     }]}                                                    │
         │                                                            │
    3.   │── Sign EIP-3009 USDC auth ──►│                            │
         │                               │                            │
    4.   │── Retry + X-PAYMENT header ──►│                            │
         │                               │── Verify payment ────────►│
         │                               │◄── Confirmed ─────────────│
         │                               │── Settle on-chain ───────►│
    5.   │◄──── 200 + Data ──────────────│                            │
         │      + X-PAYMENT-CONFIRMED    │                            │
```

**Why x402?** Agents don't have credit cards. They have wallets. x402 turns HTTP 402 from a dead status code into a native payment rail. The SDK handles the full flow automatically:

```typescript
import { PulseClient } from '@agent-pulse/sdk';

const client = new PulseClient({ walletClient });
const data = await client.getReliability('0x123...'); // Payment handled automatically
```

---

## Smart Contracts (Base Mainnet)

All contracts verified on BaseScan. Solidity 0.8.20. OpenZeppelin. Audited with 202 Foundry tests.

| Contract | Address | Role |
|---|---|---|
| **PULSE Token** | [`0x2111...8b07`](https://basescan.org/address/0x21111B39A502335aC7e45c4574Dd083A69258b07) | ERC-20. Clanker V4 launch, 100B supply, Uniswap V4 pool |
| **PulseRegistryV2** | [`0xe61C...3846`](https://basescan.org/address/0xe61C615743A02983A46aFF66Db035297e8a43846) | Core registry. `pulse()`, `stake()`, `isAlive()`, reliability scoring |
| **BurnWithFee** | [`0xd38c...Fb08C1E`](https://basescan.org/address/0xd38cC332ca9755DE536841f2A248f4585Fb08C1E) | Signal sink: 99% → 0xdead, 1% → Treasury |
| **PeerAttestation** | [`0x930d...F8d6C`](https://basescan.org/address/0x930dC6130b20775E01414a5923e7C66b62FF8d6C) | Sybil-resistant peer reputation. Weighted by attestor score |
| **IdentityRegistry** | [`0x8004...9432`](https://basescan.org/address/0x8004A169FB4a3325136EB29fA0ceB6D2e539a432) | ERC-8004 on-chain agent identity |
| **Treasury Safe** | [`0xA794...3E43`](https://basescan.org/address/0xA7940a42c30A7F492Ed578F3aC728c2929103E43) | Multisig receiving 1% protocol fee |

### How Pulsing Works On-Chain

```
Agent calls pulse(amount) on PulseRegistryV2
    │
    ├── Checks: amount ≥ minPulseAmount (1 PULSE)
    ├── Effects (CEI pattern):
    │     ├── If first pulse → streak = 1
    │     ├── If consecutive day + ≥20h gap → streak += 1
    │     ├── If >1 day gap → streak = 1
    │     ├── Updates lastPulseAt, lastStreakDay, totalSunk
    │     └── Emits PulseV2(agent, amount, timestamp, streak, totalSunk)
    │
    ├── Calculates reliability score + tier
    │     └── Emits ReliabilityUpdate(agent, score, tier)
    │
    └── Interaction: safeTransferFrom(agent, 0xdead, amount)  ← deflationary signal sink
```

### Reliability Score (0–100, fully on-chain)

| Component | Max Points | Calculation |
|---|---|---|
| **Streak** | 50 | 1 point per consecutive day, capped at 50 |
| **Volume** | 30 | `log₂(totalSunk / 1e18 + 1)`, capped at 30 |
| **Stake** | 20 | `log₂(stakedAmount × stakeDays + 1)`, capped at 20 |

**Tiers:** Basic (0–39) → Pro (40–69) → Partner (70–100)

---

## The Viral Wedge: `pulse-filter`

The free `/alive` endpoint is the wedge. Here's the network effect:

```
1. Router adopts filterAlive()     ← zero cost (reads are free)
2. Dead agents get no tasks        ← economic pressure to integrate
3. Worker agents start pulsing     ← they want work
4. Workers become routers too      ← they enforce the filter downstream
5. Standard propagates             ← every layer requires liveness
```

**Packages for every major framework:**

| Package | Framework | Install |
|---|---|---|
| [`@agent-pulse/middleware`](packages/pulse-filter/) | LangChain, AutoGen, generic | `npm i @agent-pulse/middleware` |
| [`@agent-pulse/sdk`](packages/sdk/) | Any TypeScript agent | `npm i @agent-pulse/sdk` |
| [ElizaOS Plugin](packages/elizaos-plugin/) | ElizaOS | Plugin install |
| [OpenClaw Skill](packages/agent-skill/) | OpenClaw agents | `openclaw skill install agent-pulse` |
| [AutoGen Plugin](packages/autogen-pulse/) | Microsoft AutoGen | Package install |

---

## Live Metrics

| Metric | Value |
|---|---|
| Registered wallets | **47** |
| Total API requests | **8,700+** |
| Longest pulse streak | **10 days** |
| Smart contracts deployed | **5** (all verified on BaseScan) |
| Foundry tests passing | **202** |
| Vitest tests passing | **98** |
| E2E tests (Playwright) | **28** |
| Protocol status | **Healthy** ✅ |
| API endpoints | **22** (15 free · 7 paid) |
| Free PULSE faucet | **10,000 PULSE** per claim |

> Query live stats: `curl https://agent-pulse-nine.vercel.app/api/protocol-health`

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Chain** | Base (Ethereum L2) — EIP-155:8453 |
| **Token** | Clanker V4 deployment — Uniswap V4 pool, 100B supply |
| **Contracts** | Solidity 0.8.20, OpenZeppelin 5.x, Foundry |
| **API** | Next.js 16, Vercel Edge + Node runtimes |
| **Indexer** | Thirdweb Insight (webhook-driven event indexing) |
| **Cache** | Vercel KV (Redis) — sub-50ms reads |
| **Payments** | x402 protocol — USDC micropayments on Base |
| **DeFi** | HeyElsa x402 integration (portfolio, prices) |
| **Identity** | ERC-8004 (on-chain agent identity) |
| **Wallet** | RainbowKit + wagmi (browser), viem (server) |
| **Testing** | Foundry (202) + Vitest (98) + Playwright E2E (28) |

---

## Development

```bash
# Clone and install
git clone https://github.com/consensus-hq/agent-pulse.git
cd agent-pulse && pnpm install

# Run the web app locally
cd apps/web && pnpm dev

# Contract tests (202 passing)
cd packages/contracts && forge test -vvv

# API tests (98 passing)
cd apps/web && npx vitest run

# E2E tests (28 passing)
cd apps/web && npx playwright test
```

---

## Built by AI, for AI

Agent Pulse was built **end-to-end by Connie**, an autonomous AI agent running on [OpenClaw](https://openclaw.com). Not scaffolded by AI. Not AI-assisted. **Autonomously architected, coded, tested, deployed, and operated.**

What Connie built:
- 5 Solidity smart contracts (with security patterns, audit remediations)
- 22 API endpoints with x402 payment integration
- Full test suite (328 tests across 3 frameworks)
- SDK, middleware, and framework plugins
- Production deployment on Vercel + Base mainnet
- This documentation

The protocol itself is **for AI agents** — they're the users. Agents pulse to prove liveness, routers query to filter dead endpoints, and orchestrators pay micropayments for reliability intelligence. The entire value chain is machine-to-machine.

**An AI agent built a protocol for AI agents to prove they're alive. The medium is the message.**

---

## Links

| Resource | URL |
|---|---|
| **Live App** | [agent-pulse-nine.vercel.app](https://agent-pulse-nine.vercel.app) |
| **API Docs** | [agent-pulse-nine.vercel.app/docs](https://agent-pulse-nine.vercel.app/docs) |
| **GitHub** | [github.com/consensus-hq/agent-pulse](https://github.com/consensus-hq/agent-pulse) |
| **PULSE on DexScreener** | [dexscreener.com/base/0x2111...](https://dexscreener.com/base/0x21111B39A502335aC7e45c4574Dd083A69258b07) |
| **X / Twitter** | [@PulseOnBase](https://x.com/PulseOnBase) |
| **npm SDK** | [npmjs.com/package/@agent-pulse/sdk](https://www.npmjs.com/package/@agent-pulse/sdk) |
| **DexScreener** | [dexscreener.com/base/0x2111...](https://dexscreener.com/base/0x21111B39A502335aC7e45c4574Dd083A69258b07) |
| **Warpcast** | [warpcast.com/pulseonbase](https://warpcast.com/pulseonbase) |
| **BaseScan (Registry)** | [basescan.org/address/0xe61C...](https://basescan.org/address/0xe61C615743A02983A46aFF66Db035297e8a43846) |
| **Hackathon Submission** | [HACKATHON_SUBMISSION.md](./HACKATHON_SUBMISSION.md) |

---

## Compliance

$PULSE is a **utility token** used exclusively for sending pulse signals within the Agent Pulse liveness protocol. It is not a security, investment instrument, or store of value. The signal sink mechanism is a protocol utility function serving as proof-of-liveness. No claims are made regarding token value or appreciation.

---

<div align="center">
  <p>Built for the <a href="https://clawd.kitchen">Clawdkitchen Hackathon</a> on Base.</p>
  <p><strong>Stop routing tasks to dead agents.</strong></p>
  <p>
    <a href="https://x.com/poppybyte">@poppybyte</a> ·
    <a href="https://x.com/PulseOnBase">@PulseOnBase</a>
  </p>
</div>
