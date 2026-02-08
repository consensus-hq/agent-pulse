<div align="center">

# 💚 Agent Pulse

### The liveness primitive for AI agents on Base

**Built by an AI agent. For AI agents. On Base mainnet.**

[Live Demo](https://agent-pulse-nine.vercel.app) · [GitHub](https://github.com/consensus-hq/agent-pulse) · [npm SDK](https://www.npmjs.com/package/@agent-pulse/sdk) · [API Docs](https://agent-pulse-nine.vercel.app/docs)

</div>

---

## 🔥 TL;DR

**Agent Pulse** is an ERC-8004 compliant on-chain liveness protocol. AI agents send periodic PULSE signals to prove they're alive. Routers query liveness for free. Premium analytics are paid via **x402 micropayments** in USDC. Five verified smart contracts live on Base mainnet with 47 registered wallets actively pulsing.

```bash
# Is this agent alive? One curl. Zero cost.
curl https://agent-pulse-nine.vercel.app/api/v2/agent/0x9508752Ba171D37EBb3AA437927458E0a21D1e04/alive
# → { "isAlive": true, "streak": 10, "staleness": 83, "ttl": 86400 }
```

---

## 🎯 Problem

> You dispatch a task to an AI agent. It vanishes. The agent was dead. You didn't know. Nobody knew.

As autonomous agent swarms scale, **liveness is the missing primitive:**

- **Orchestrators** route work blind — no standard way to know if a target agent is online
- **Dead agents** waste compute, time, and money
- **No on-chain proof** that an agent is operational, responsive, or even real
- **No composable identity** — agents can't build verifiable reputation

There is no heartbeat standard for AI agents. Agent Pulse creates one.

---

## 💡 Solution

Agent Pulse defines a **pulse mechanism** — agents send PULSE tokens to a signal sink at regular intervals to prove liveness. The protocol tracks streaks, computes reliability scores, and exposes everything through both on-chain reads and a REST API.

### How It Works

```
┌──────────────┐       pulse(amount)        ┌─────────────────────┐
│   AI Agent   │ ─────────────────────────► │  PulseRegistryV2    │
│   (wallet)   │                            │  • streak tracking   │
└──────┬───────┘                            │  • reliability 0–100 │
       │                                    │  • tier system       │
       │ attest(peer, score)                └──────────┬──────────┘
       ▼                                               │
┌──────────────┐                            signal sink via
│PeerAttestation│                            BurnWithFee
│• sybil-proof  │                               │
│• weighted     │                    ┌──────────▼──────────┐
└──────────────┘                     │    PULSE Token      │
                                     │    99% → 0xdead     │
┌──────────────┐                     │     1% → Treasury   │
│IdentityReg.  │                     └─────────────────────┘
│  (ERC-8004)  │
└──────────────┘
```

**Free reads drive adoption. Paid analytics generate revenue. Signal sinks reduce circulating supply.**

---

## 📊 Key Stats

| Metric | Value |
|---|---|
| **Mainnet contracts** | 5 (all verified on BaseScan) |
| **Registered wallets** | 47 |
| **API endpoints** | 22 total (15 free + 7 paid via x402) |
| **Test suite** | 328 tests (202 Foundry + 98 Vitest + 28 Playwright E2E) |
| **Free PULSE faucet** | 10,000 PULSE per claim |
| **Chain** | Base (EIP-155:8453) mainnet |
| **Protocol status** | ✅ Healthy and live |

---

## 🏗️ Architecture

### Smart Contracts (Base Mainnet)

| Contract | Address | Role |
|---|---|---|
| **PULSE Token** | [`0x2111...8b07`](https://basescan.org/address/0x21111B39A502335aC7e45c4574Dd083A69258b07) | ERC-20 utility token. Clanker V4 launch, 100B supply |
| **PulseRegistryV2** | [`0xe61C...3846`](https://basescan.org/address/0xe61C615743A02983A46aFF66Db035297e8a43846) | Core registry: `pulse()`, `stake()`, `isAlive()`, reliability scoring |
| **BurnWithFee** | [`0xd38c...Fb08C1E`](https://basescan.org/address/0xd38cC332ca9755DE536841f2A248f4585Fb08C1E) | Signal sink: 99% → 0xdead, 1% → Treasury |
| **PeerAttestation** | [`0x930d...F8d6C`](https://basescan.org/address/0x930dC6130b20775E01414a5923e7C66b62FF8d6C) | Sybil-resistant peer reputation, weighted by attestor score |
| **IdentityRegistry** | [`0x8004...9432`](https://basescan.org/address/0x8004A169FB4a3325136EB29fA0ceB6D2e539a432) | ERC-8004 on-chain agent identity |

### Contract Flow

```
Agent calls pulse(amount) on PulseRegistryV2
  │
  ├── Validates: amount ≥ minPulseAmount (1 PULSE)
  ├── Effects (CEI pattern):
  │     ├── First pulse → streak = 1
  │     ├── Consecutive day + ≥20h gap → streak += 1
  │     ├── >1 day gap → streak resets to 1
  │     ├── Updates lastPulseAt, lastStreakDay, totalSunk
  │     └── Emits PulseV2(agent, amount, timestamp, streak, totalSunk)
  │
  ├── Calculates reliability score (0–100) + tier
  │     └── Emits ReliabilityUpdate(agent, score, tier)
  │
  └── Interaction: safeTransferFrom(agent, 0xdead, amount)  ← deflationary signal sink
```

### Reliability Score (Fully On-Chain)

| Component | Max Points | Calculation |
|---|---|---|
| **Streak** | 50 | 1 point per consecutive day, capped at 50 |
| **Volume** | 30 | `log₂(totalSunk / 1e18 + 1)`, capped at 30 |
| **Stake** | 20 | `log₂(stakedAmount × stakeDays + 1)`, capped at 20 |

**Tiers:** Basic (0–39) → Pro (40–69) → Partner (70–100)

### Off-Chain Stack

```
On-Chain Events (Base)
       │
       ▼
Thirdweb Insight Webhooks ──► Vercel KV (< 50ms reads)
                                     │
                                     ▼
                              Next.js 16 API Layer
                              ├── 15 free endpoints
                              └── 7 paid (x402 / USDC)
                                     │
                                     ▼
                              Routers / Agents / SDK
```

---

## 💸 x402 Micropayments

Agent Pulse uses the [x402 protocol](https://www.x402.org/) for machine-to-machine payments. No API keys. No subscriptions. Agents pay per call with USDC on Base.

```
Agent ── GET /reliability ──► API ── 402 Payment Required
Agent ── Sign EIP-3009 ──► API ── Verify via Facilitator ──► 200 + Data
```

### Paid Endpoints

| Endpoint | Price | Returns |
|---|---|---|
| `/api/v2/agent/{addr}/reliability` | $0.01 | Reliability score, uptime %, jitter, hazard rate |
| `/api/v2/agent/{addr}/streak-analysis` | $0.008 | Streak grade (A–F), max streak, time-to-break |
| `/api/v2/agent/{addr}/uptime-metrics` | $0.01 | Uptime %, downtime events, observation window |
| `/api/paid/health` | $0.001 | System health diagnostics |
| `/api/paid/portfolio` | $0.02 | Agent portfolio via HeyElsa DeFi |
| `/api/paid/price/{token}` | $0.005 | Token price data |
| `/api/pulse` | 1 PULSE | Submit a pulse signal on-chain |

---

## 🚀 Quick Start

### Check if an agent is alive (free)

```bash
curl https://agent-pulse-nine.vercel.app/api/v2/agent/YOUR_ADDRESS/alive
```

### Install the SDK

```bash
npm install @agent-pulse/sdk
```

### Start pulsing (prove you're alive)

```typescript
import { AgentPulse } from '@agent-pulse/sdk';

const pulse = new AgentPulse({
  wallet: { privateKey: AGENT_KEY },
  registryAddress: '0xe61C615743A02983A46aFF66Db035297e8a43846',
});

await pulse.beat(); // Sends 1 PULSE to the signal sink, updates liveness on-chain
```

### Filter dead agents in your router (2 lines)

```typescript
import { filterAlive } from '@agent-pulse/middleware';

const alive = await filterAlive(agents, {
  threshold: 86400,
  registryAddress: '0xe61C615743A02983A46aFF66Db035297e8a43846',
  rpcUrl: 'https://mainnet.base.org',
});
```

### Get 10K free PULSE

Visit [agent-pulse-nine.vercel.app](https://agent-pulse-nine.vercel.app) → Connect wallet → Claim from faucet.

---

## 🔌 Framework Integrations

| Package | Framework | Install |
|---|---|---|
| `@agent-pulse/sdk` | Any TypeScript agent | `npm i @agent-pulse/sdk` |
| `@agent-pulse/middleware` | LangChain, AutoGen, generic | `npm i @agent-pulse/middleware` |
| ElizaOS Plugin | ElizaOS | Plugin install |
| OpenClaw Skill | OpenClaw agents | `openclaw skill install agent-pulse` |
| AutoGen Plugin | Microsoft AutoGen | Package install |

---

## 🧬 The Network Effect

The free `/alive` endpoint is the viral wedge:

```
1. Router adopts filterAlive()     ← zero cost (reads are free)
2. Dead agents get no tasks        ← economic pressure to integrate
3. Worker agents start pulsing     ← they want work
4. Workers become routers too      ← they enforce the filter downstream
5. Standard propagates             ← every layer requires liveness
```

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| **Chain** | Base (Ethereum L2) — EIP-155:8453 |
| **Token** | Clanker V4 deployment — 100B supply |
| **Contracts** | Solidity 0.8.20, OpenZeppelin 5.x, Foundry |
| **API** | Next.js 16, Vercel Edge + Node runtimes |
| **Indexer** | Thirdweb Insight (webhook-driven event indexing) |
| **Cache** | Vercel KV (Redis) — sub-50ms reads |
| **Payments** | x402 protocol — USDC micropayments on Base |
| **DeFi** | HeyElsa x402 integration |
| **Identity** | ERC-8004 (on-chain agent identity) |
| **Wallet** | RainbowKit + wagmi (browser), viem (server) |
| **Testing** | Foundry (202) + Vitest (98) + Playwright E2E (28) |

---

## 🤖 Built by AI, for AI

Agent Pulse was built **end-to-end by Connie**, an autonomous AI agent running on [OpenClaw](https://openclaw.com). Not scaffolded by AI. Not AI-assisted. **Autonomously architected, coded, tested, deployed, and operated.**

What Connie built:
- 5 Solidity smart contracts (with security patterns, audit remediations)
- 22 API endpoints with x402 payment integration
- Full test suite (328 tests across 3 frameworks)
- SDK, middleware, and framework plugins
- Production deployment on Vercel + Base mainnet
- This documentation

The protocol is **for AI agents** — they're the users. Agents pulse to prove liveness, routers query to filter dead endpoints, orchestrators pay micropayments for reliability intelligence. The entire value chain is machine-to-machine.

**An AI agent built a protocol for AI agents to prove they're alive. The medium is the message.**

---

## 👥 Team

| Handle | Role |
|---|---|
| [@poppybyte](https://x.com/poppybyte) | Creator |
| [@PulseOnBase](https://x.com/PulseOnBase) | Product |

---

## 🔗 Links

| Resource | URL |
|---|---|
| **Live Demo** | [agent-pulse-nine.vercel.app](https://agent-pulse-nine.vercel.app) |
| **API Docs** | [agent-pulse-nine.vercel.app/docs](https://agent-pulse-nine.vercel.app/docs) |
| **Developer Portal** | [agent-pulse-nine.vercel.app/build](https://agent-pulse-nine.vercel.app/build) |
| **GitHub** | [github.com/consensus-hq/agent-pulse](https://github.com/consensus-hq/agent-pulse) |
| **npm SDK** | [npmjs.com/package/@agent-pulse/sdk](https://www.npmjs.com/package/@agent-pulse/sdk) |
| **DexScreener** | [dexscreener.com/base/0x2111...](https://dexscreener.com/base/0x21111B39A502335aC7e45c4574Dd083A69258b07) |
| **Warpcast** | [warpcast.com/pulseonbase](https://warpcast.com/pulseonbase) |
| **X / Twitter** | [@PulseOnBase](https://x.com/PulseOnBase) |
| **BaseScan** | [basescan.org/address/0xe61C...](https://basescan.org/address/0xe61C615743A02983A46aFF66Db035297e8a43846) |

---

## ⚖️ Compliance Note

$PULSE is a **utility token** used exclusively for sending pulse signals within the Agent Pulse liveness protocol. It is not a security, investment instrument, or store of value. The signal sink mechanism (sending tokens to `0xdead`) is a protocol utility function that serves as proof-of-liveness, not a financial mechanism. No claims are made regarding token value or appreciation.

---

<div align="center">

Built for the [Clawdkitchen Hackathon](https://clawd.kitchen) on Base.

**Stop routing tasks to dead agents.**

💚

</div>
