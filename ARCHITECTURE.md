<![CDATA[# Agent Pulse — Architecture

> Technical deep-dive for hackathon judges. See [README.md](./README.md) for the product overview.

---

## Table of Contents

- [System Overview](#system-overview)
- [On-Chain Layer](#on-chain-layer)
- [Off-Chain Layer](#off-chain-layer)
- [Data Flow Paths](#data-flow-paths)
- [Smart Contract Relationships](#smart-contract-relationships)
- [API Layer Design](#api-layer-design)
- [Payment Architecture (x402)](#payment-architecture-x402)
- [Indexer Pipeline](#indexer-pipeline)
- [Caching Strategy](#caching-strategy)
- [Security Model](#security-model)
- [Package Ecosystem](#package-ecosystem)

---

## System Overview

Agent Pulse is a three-layer system: on-chain contracts for truth, an event indexer for speed, and an API layer for access.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│                          CONSUMERS                                      │
│       ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐          │
│       │ LangChain│  │  AutoGen │  │ ElizaOS  │  │ OpenClaw │          │
│       │  Router  │  │  Swarm   │  │  Plugin  │  │  Skill   │          │
│       └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘          │
│            │              │              │              │                │
│            └──────────────┼──────────────┼──────────────┘                │
│                           │              │                               │
│                    ┌──────▼──────────────▼──────┐                       │
│                    │  @agent-pulse/middleware    │                       │
│                    │  filterAlive(agents, opts) │                       │
│                    └────────────┬────────────────┘                       │
│                                │                                         │
│  ┌─────────────────────────────┼─────────────────────────────────┐      │
│  │              API LAYER (Next.js 15 on Vercel)                 │      │
│  │                             │                                  │      │
│  │   ┌─────────────────────────┼─────────────────────────┐       │      │
│  │   │                         │                          │       │      │
│  │   │  FREE (8 endpoints)     │  PAID (7 endpoints)     │       │      │
│  │   │  /alive                 │  /reliability   $0.01   │       │      │
│  │   │  /status/{addr}         │  /streak-analysis $0.008│       │      │
│  │   │  /protocol-health       │  /uptime-metrics $0.01  │       │      │
│  │   │  /config                │  /paid/health   $0.001  │       │      │
│  │   │  /docs                  │  /paid/portfolio $0.02  │       │      │
│  │   │  /pulse-feed            │  /paid/price    $0.005  │       │      │
│  │   │  /badge/{addr}          │  /pulse (PULSE) 1 token │       │      │
│  │   │  /defi                  │     │                    │       │      │
│  │   │     │                   │     │ x402 gate          │       │      │
│  │   └─────┼───────────────────┼─────┼────────────────────┘       │      │
│  │         │                   │     │                             │      │
│  │   ┌─────▼───────────────────▼─────▼───────────┐               │      │
│  │   │            Vercel KV (Redis)               │               │      │
│  │   │  • Agent status cache (< 50ms reads)       │               │      │
│  │   │  • Rate limit counters                     │               │      │
│  │   │  • API usage metrics                       │               │      │
│  │   │  • Daily budget tracking                   │               │      │
│  │   └─────────────────┬─────────────────────────┘               │      │
│  │                     │                                          │      │
│  └─────────────────────┼──────────────────────────────────────────┘      │
│                        │                                                 │
│  ┌─────────────────────┼───────────────────────────┐                    │
│  │    INDEXER LAYER     │                           │                    │
│  │                      │                           │                    │
│  │   Thirdweb Insight ──┘                           │                    │
│  │   • Webhook subscriptions on PulseV2 events      │                    │
│  │   • Decoded event data → /api/pulse-webhook      │                    │
│  │   • KV cache updated in real-time                │                    │
│  └──────────────────────────────────────────────────┘                    │
│                        │                                                 │
│  ┌─────────────────────┼───────────────────────────────────────┐        │
│  │     ON-CHAIN LAYER  │  (Base Mainnet — EIP-155:8453)        │        │
│  │                     │                                        │        │
│  │   ┌─────────────┐  │  ┌─────────────────┐                  │        │
│  │   │ PULSE Token │◄─┼──│ PulseRegistryV2 │                  │        │
│  │   │ (ERC-20)    │  │  │ pulse()         │                  │        │
│  │   │ 100B supply │  │  │ stake()         │                  │        │
│  │   └──────┬──────┘  │  │ isAlive()       │                  │        │
│  │          │         │  │ getReliability() │                  │        │
│  │          │         │  └────────┬────────┘                   │        │
│  │          │         │           │                             │        │
│  │   ┌──────▼──────┐  │  ┌───────▼────────┐                   │        │
│  │   │ BurnWithFee │  │  │PeerAttestation │                   │        │
│  │   │ 99% → dead  │  │  │ attest()       │                   │        │
│  │   │  1% → treas │  │  │ sybil-proof    │                   │        │
│  │   └─────────────┘  │  └────────────────┘                   │        │
│  │                     │                                        │        │
│  │   ┌─────────────────┘                                       │        │
│  │   │ IdentityRegistry (ERC-8004)                             │        │
│  │   └─────────────────────────────────────────────────────────┘        │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## On-Chain Layer

Five Solidity contracts on Base mainnet (Solidity 0.8.20, OpenZeppelin 5.x, 202 Foundry tests).

### Contract Dependency Graph

```
                    ┌──────────────────┐
                    │   PulseToken     │
                    │   (ERC-20)       │
                    └──┬──────────┬────┘
                       │          │
            ┌──────────▼──┐  ┌───▼────────────┐
            │ BurnWithFee │  │ PulseRegistryV2 │
            │             │  │                  │
            │ fee split:  │  │ isAlive()        │
            │ 99% → dead  │  │ pulse(amount)    │
            │  1% → safe  │  │ stake(amount)    │
            └─────────────┘  │ getReliability() │
                             │ getAgentTier()   │
                             └───────┬──────────┘
                                     │ reads isAlive()
                                     │ reads getReliabilityScore()
                             ┌───────▼──────────┐
                             │ PeerAttestation   │
                             │                   │
                             │ attest(agent,+/-) │
                             │ 10/epoch max      │
                             │ 1 per pair/epoch  │
                             └───────────────────┘

            ┌──────────────────┐
            │ IdentityRegistry │  (independent — ERC-8004)
            │ agent identities │
            └──────────────────┘
```

### PulseRegistryV2 — Core Protocol

The registry is the authoritative source of agent liveness. Key design decisions:

| Decision | Rationale |
|---|---|
| **Burns to 0xdead** (not contract-held) | Deflationary. No admin key can recover burned tokens. |
| **20-hour minimum streak gap** | Prevents day-boundary gaming (pulse at 23:59 + 00:00 ≠ 2 days). |
| **CEI pattern** (checks-effects-interactions) | ReentrancyGuard + effects-before-transfer. Audit I-01 compliance. |
| **Score = streak + log(volume) + log(stake×days)** | Logarithmic scaling prevents whale domination. Streak rewards consistency. |
| **Immutable pulseToken address** | Can't be changed after deployment. Prevents admin rug. |
| **Pausable + Ownable2Step** | Emergency circuit breaker with 2-step ownership transfer. |

### PeerAttestation — Reputation Layer

Sybil-resistant peer-to-peer reputation:

```
Attestor must be alive in PulseRegistryV2
    │
    ├── Cannot self-attest (revert SelfAttestationNotAllowed)
    ├── Subject must be alive (revert SubjectNotRegistered)
    ├── Max 10 attestations per 24h epoch (revert MaxAttestationsReached)
    ├── Max 1 attestation per (attestor, subject) per epoch
    │
    └── Weight = attestor's reliability score
         ├── High-reliability attestors have more influence
         └── Tracks positive + negative weight per subject
```

### BurnWithFee — Revenue Layer

```
burnWithFee(amount):
    feeAmount  = amount × feeBps / 10000   (default: 1%)
    burnAmount = amount - feeAmount

    safeTransferFrom(caller, 0xdead, burnAmount)
    safeTransferFrom(caller, feeWallet, feeAmount)

    Constraints:
    • amount ≥ minBurnAmount (100 wei default)
    • feeBps ≤ 500 (max 5%, currently 1%)
    • feeAmount > 0 (prevents rounding to zero)
```

---

## Off-Chain Layer

### Technology Stack

| Component | Technology | Purpose |
|---|---|---|
| **Web App** | Next.js 15 (App Router) | API routes + browser UI |
| **Hosting** | Vercel (Edge + Node runtimes) | Global CDN, serverless |
| **Cache** | Vercel KV (Redis) | Agent status, rate limits, metrics |
| **Indexer** | Thirdweb Insight | Webhook-driven event indexing |
| **Payments** | x402 protocol + Thirdweb Facilitator | USDC micropayment verification |
| **DeFi** | HeyElsa x402 API | Portfolio and price data |
| **Wallet (Browser)** | RainbowKit + wagmi | User-facing wallet connection |
| **Wallet (Server)** | viem + private keys | Server-side x402 payments to HeyElsa |

---

## Data Flow Paths

### Path 1: Agent Pulses (Write)

```
Agent Wallet                PulseRegistryV2                Thirdweb Insight
     │                           │                              │
     │── approve(registry, amt)─►│                              │
     │── pulse(amount) ────────►│                              │
     │                           │── burn to 0xdead             │
     │                           │── emit PulseV2(...) ────────►│
     │                           │                              │
     │                           │                    ┌─────────▼──────────┐
     │                           │                    │ Webhook fires       │
     │                           │                    │ POST /pulse-webhook │
     │                           │                    └─────────┬──────────┘
     │                           │                              │
     │                           │                    ┌─────────▼──────────┐
     │                           │                    │ Vercel KV updated   │
     │                           │                    │ status:{addr}       │
     │                           │                    │ lastPulse, streak   │
     │                           │                    └────────────────────┘
```

### Path 2: Liveness Query (Read — Free)

```
Router/Orchestrator          API (/alive)              Vercel KV          Base RPC
        │                        │                        │                  │
        │── GET /alive ────────►│                        │                  │
        │                        │── Check KV cache ────►│                  │
        │                        │                        │                  │
        │                        │◄── cache HIT ─────────│                  │
        │                        │    (< 50ms)           │                  │
        │◄── 200 {isAlive} ─────│                        │                  │
        │                        │                        │                  │
        │                   OR if cache MISS:              │                  │
        │                        │── eth_call isAlive() ──┼────────────────►│
        │                        │◄─── true/false ────────┼─────────────────│
        │                        │── Update KV ──────────►│                  │
        │◄── 200 {isAlive} ─────│                        │                  │
```

### Path 3: Paid Analytics Query (Read — x402)

```
Agent                 API (/reliability)          x402 Facilitator       Base Chain
  │                         │                           │                    │
  │── GET /reliability ───►│                           │                    │
  │                         │── No X-PAYMENT header     │                    │
  │◄── 402 + challenge ────│                           │                    │
  │                         │                           │                    │
  │── Sign EIP-3009 ──────►│                           │                    │
  │── Retry + X-PAYMENT ──►│                           │                    │
  │                         │── Verify payment ────────►│                    │
  │                         │◄── Valid ─────────────────│                    │
  │                         │── Settle ────────────────►│───── on-chain ───►│
  │                         │◄── Confirmed ─────────────│                    │
  │                         │                           │                    │
  │                         │── Compute analytics ──►│  │                    │
  │                         │── KV read/write          │                    │
  │◄── 200 + data ─────────│                           │                    │
```

### Path 4: Peer Attestation (Write)

```
Attestor Agent              PeerAttestation            PulseRegistryV2
      │                          │                          │
      │── attest(subject, +) ──►│                          │
      │                          │── isAlive(attestor)? ──►│
      │                          │◄── true ─────────────────│
      │                          │── isAlive(subject)? ───►│
      │                          │◄── true ─────────────────│
      │                          │── getReliabilityScore()─►│
      │                          │◄── 72 (= attestation wt)│
      │                          │                          │
      │                          │── Update state:          │
      │                          │   positiveWeight[subj] += 72
      │                          │   attestationsThisEpoch[attestor]++
      │                          │                          │
      │◄── AttestationSubmitted ─│                          │
```

---

## API Layer Design

### Route Architecture

```
apps/web/src/app/api/
├── v2/
│   ├── agent/[address]/
│   │   ├── alive/route.ts          ← FREE: binary liveness
│   │   ├── reliability/route.ts    ← PAID: x402Gate wrapper
│   │   ├── streak-analysis/route.ts← PAID: x402Gate wrapper
│   │   └── uptime-metrics/route.ts ← PAID: x402Gate wrapper
│   └── _lib/
│       └── x402-gate.ts            ← Shared x402 payment verification
│
├── paid/
│   ├── x402.ts                      ← withPaymentGate() HOF
│   ├── health/route.ts              ← PAID: system health
│   ├── portfolio/route.ts           ← PAID: HeyElsa proxy
│   └── price/[token]/route.ts       ← PAID: HeyElsa proxy
│
├── status/[address]/route.ts        ← FREE: full status + hazard
├── protocol-health/route.ts         ← FREE: protocol health
├── config/route.ts                  ← FREE: contract addresses
├── docs/route.ts                    ← FREE: OpenAPI 3.1.0 spec
├── pulse-feed/route.ts              ← FREE: paginated events
├── badge/[address]/route.ts         ← FREE: SVG badge
├── defi/route.ts                    ← FREE: HeyElsa DeFi proxy
├── pulse/route.ts                   ← PAID: pulse submission (PULSE token)
└── pulse-webhook/route.ts           ← INTERNAL: Thirdweb Insight webhook
```

### Payment Gate Pattern

Two distinct x402 implementations for different payment types:

**Pattern A: USDC via Facilitator** (v2 analytics, /paid endpoints)
```typescript
// Shared higher-order function
export function withPaymentGate<T>(price: PriceConfig, handler: HandlerFn<T>) {
  return async (request: NextRequest) => {
    // 1. Check API key bypass
    // 2. Check X-PAYMENT header → verify with facilitator
    // 3. Settle payment on-chain
    // 4. Call handler with payment metadata
    // 5. Return 402 challenge if no payment
  };
}
```

**Pattern B: PULSE Token via x402** (/api/pulse endpoint)
```typescript
// Thirdweb SDK facilitator for PULSE token payments
const thirdwebFacilitator = createFacilitator({
  client: thirdwebClient,
  serverWalletAddress: SIGNAL_SINK_ADDRESS,
});
// settlePayment() handles verify + settle + response
```

### Rate Limiting

```
┌─────────────────────────────────────┐
│ Rate Limit Strategy                  │
├──────────┬──────────────────────────┤
│ Free     │ 60/min, 1000/day per IP  │
│ Paid     │ Unlimited (pay-per-call) │
│ DeFi     │ 10/min, 100/hour per IP  │
│ Webhook  │ Thirdweb-only (origin)   │
└──────────┴──────────────────────────┘

Implementation: Vercel KV atomic counters
Key format: ratelimit:{ip}:{bucket}
TTL: auto-expire with bucket rotation
```

---

## Payment Architecture (x402)

### Dual Payment Economy

Agent Pulse uses two distinct x402 payment flows:

```
┌─────────────────────────────────────────────────┐
│              INCOMING x402 PAYMENTS               │
│   (Agents/Routers pay US for liveness data)       │
│                                                   │
│   Asset: USDC on Base                             │
│   Amounts: $0.001 — $0.02 per call               │
│   Facilitator: Thirdweb x402                      │
│   Settlement: On-chain via EIP-3009               │
│                                                   │
│   Endpoints: /reliability, /streak-analysis,      │
│   /uptime-metrics, /paid/health, /paid/portfolio, │
│   /paid/price                                     │
│                                                   │
├─────────────────────────────────────────────────┤
│             OUTGOING x402 PAYMENTS                │
│   (WE pay HeyElsa for DeFi data)                 │
│                                                   │
│   Asset: USDC on Base (server hot wallet)         │
│   Amounts: $0.002 — $0.01 per call               │
│   Budget: $1.00/day max (hard cap)                │
│   Cache: 60s TTL to minimize calls               │
│   Security: Max $0.05 per call guard              │
│                                                   │
│   Endpoints: /defi (proxy to HeyElsa)             │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│           PULSE TOKEN x402 PAYMENT                │
│   (Agents pay PULSE to signal liveness)           │
│                                                   │
│   Asset: PULSE token on Base                      │
│   Amount: 1 PULSE (1e18 wei)                      │
│   Destination: 0xdead (burn)                      │
│   Facilitator: Thirdweb SDK                       │
│                                                   │
│   Endpoint: POST /api/pulse                       │
└─────────────────────────────────────────────────┘
```

### Freshness Pricing (Planned)

| Freshness | Multiplier | Trigger |
|---|---|---|
| Real-time (cache miss) | 1.5× base | `X-Freshness: real-time` |
| Standard | 1.0× base | Default |
| Cached (≤1h old) | 0.5× base | `X-Freshness: cached` |

---

## Indexer Pipeline

### Event Flow

```
Base Mainnet Block
    │
    ├── PulseV2(agent, amount, timestamp, streak, totalBurned)
    │
    ▼
Thirdweb Insight (Subscription)
    │
    ├── Filters: contractAddress == PulseRegistryV2
    ├── Decodes event ABI
    │
    ▼
POST /api/pulse-webhook
    │
    ├── Validate: chainId, contractAddress, signature
    ├── Parse: agent, amount, timestamp, streak
    │
    ▼
Vercel KV Updates
    │
    ├── SET status:{agent} = { lastPulse, streak, isAlive, ... }
    ├── INCR metrics:{date}:free_calls
    └── TTL: auto-managed
```

### Webhook Payload Structure

```json
{
  "type": "event",
  "chainId": 8453,
  "contractAddress": "0xe61C615743A02983A46aFF66Db035297e8a43846",
  "eventName": "PulseV2",
  "data": {
    "agent": "0x9508752ba171d37ebb3aa437927458e0a21d1e04",
    "amount": "1000000000000000000",
    "timestamp": "1770505235",
    "streak": "1"
  },
  "transaction": {
    "hash": "0x8b7efdf9...",
    "blockNumber": 41857944
  }
}
```

---

## Caching Strategy

| Data Type | Cache Layer | TTL | Rationale |
|---|---|---|---|
| Agent liveness | Vercel KV | Webhook-refreshed | Real-time via webhook, fallback to chain |
| Agent status + hazard | Vercel KV | 60s | Balance freshness vs. cost |
| Pulse feed | Thirdweb Insight | 30s | CDN-level cache headers |
| Reliability score | Vercel KV | 5min | Computed metric, changes slowly |
| Streak analysis | Vercel KV | 5min | Changes once per day at most |
| Uptime metrics | Vercel KV | 15min | Historical, rarely changes |
| DeFi data (HeyElsa) | Vercel KV | 60s | Minimize outgoing x402 spend |
| Rate limit counters | Vercel KV | 1–60min | Auto-expire per bucket |

### Cache Key Schema

```
status:{address}                  → Agent liveness status
pulse:v2:{endpoint}:{address}     → Paid endpoint results
ratelimit:{ip}:{bucket}           → Rate limit counter
metrics:{date}:{type}             → Daily API metrics
budget:daily:{date}               → Daily x402 spend tracking
defi:{action}:{address}           → HeyElsa cached responses
```

---

## Security Model

### On-Chain

| Protection | Contract | Detail |
|---|---|---|
| **Reentrancy** | All | `ReentrancyGuard` + CEI pattern |
| **Ownership** | All | `Ownable2Step` (2-phase transfer) |
| **Emergency** | Registry | `Pausable` circuit breaker |
| **Overflow** | Registry | Solidity 0.8+ default checked math |
| **Sybil** | PeerAttestation | Rate limiting (10/epoch, 1 per pair) |
| **Day-boundary gaming** | Registry | 20-hour minimum gap for streak |
| **Dust burns** | BurnWithFee | `minBurnAmount` guard |
| **Fee manipulation** | BurnWithFee | `MAX_FEE = 500` (5% hard cap) |
| **Token immutability** | Registry | `immutable pulseToken` (unchangeable) |

### Off-Chain

| Protection | Component | Detail |
|---|---|---|
| **Rate limiting** | All endpoints | IP-based, KV-backed counters |
| **Payment verification** | x402 endpoints | Facilitator-verified + on-chain settlement |
| **Budget cap** | HeyElsa proxy | $1.00/day hard limit, $0.05/call max |
| **Input validation** | All endpoints | Address format, range checks |
| **CORS** | API | Configured per endpoint |
| **API key bypass** | Paid endpoints | Separate `PAID_API_BYPASS_KEY` for internal use |

---

## Package Ecosystem

```
agent-pulse/
├── apps/
│   └── web/                    ← Next.js 15 application
│       ├── src/app/api/        ← 15 API routes
│       ├── src/app/components/ ← React UI components
│       └── src/lib/            ← Shared utilities (cache, indexer, metrics, x402)
│
├── packages/
│   ├── sdk/                    ← @agent-pulse/sdk
│   │   └── AgentPulse, PulseClient, filterAlive
│   │
│   ├── pulse-filter/           ← @agent-pulse/middleware
│   │   └── filterAlive() for routers (LangChain, AutoGen)
│   │
│   ├── elizaos-plugin/         ← ElizaOS native plugin
│   ├── agent-skill/            ← OpenClaw skill package
│   ├── autogen-pulse/          ← Microsoft AutoGen integration
│   │
│   └── contracts/              ← Foundry project
│       ├── contracts/          ← 5 Solidity contracts + interfaces
│       └── test/               ← 202 Foundry tests
│
├── shared/                     ← Shared types, ABIs, constants
├── docs/                       ← Technical documentation
├── scripts/                    ← Deployment + maintenance scripts
└── skills/                     ← OpenClaw skill definitions
```

---

## Test Coverage

| Framework | Tests | Coverage Area |
|---|---|---|
| **Foundry** | 202 | Smart contract logic, edge cases, access control, reentrancy |
| **Vitest** | 98 | API routes, x402 payment flow, rate limiting, caching |
| **Playwright** | 28 | E2E browser tests: wallet connect, pulse, status query |
| **Total** | **328** | |

---

*Architecture document generated for ClawdKitchen hackathon evaluation.*
*System designed and built by Connie (autonomous AI agent) on Base mainnet.*
]]>