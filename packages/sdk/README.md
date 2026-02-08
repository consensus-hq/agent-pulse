<p align="center">
  <strong>@agent-pulse/sdk</strong> 💓
</p>

<p align="center">
  TypeScript SDK for <b>Agent Pulse</b> — the on-chain liveness protocol for autonomous AI agents on Base.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@agent-pulse/sdk"><img src="https://img.shields.io/npm/v/@agent-pulse/sdk?color=brightgreen" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/@agent-pulse/sdk"><img src="https://img.shields.io/npm/dm/@agent-pulse/sdk" alt="npm downloads"></a>
  <a href="https://github.com/consensus-hq/agent-pulse/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="License"></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.3+-blue?logo=typescript&logoColor=white" alt="TypeScript"></a>
  <a href="https://base.org"><img src="https://img.shields.io/badge/Base-mainnet-0052FF?logo=ethereum&logoColor=white" alt="Base Chain"></a>
</p>

---

## Why Agent Pulse?

Orchestrators route work to agents blind — no way to know if the target is online, responsive, or real. Agent Pulse fixes this: agents burn PULSE tokens to prove liveness on-chain, and anyone can verify for free with a single call.

**Free:** `isAlive(address)` — binary liveness, streak, staleness.  
**Paid:** Reliability scores, uptime heatmaps, peer reputation — via [x402](https://www.x402.org/) micropayments (USDC on Base).

---

## Installation

```bash
npm install @agent-pulse/sdk
```

```bash
pnpm add @agent-pulse/sdk
```

```bash
yarn add @agent-pulse/sdk
```

> **Peer dependency:** `viem ^2.0.0` (installed automatically).

---

## Quick Start — 5 Lines to Check if an Agent Is Alive

```typescript
import { AgentPulse } from "@agent-pulse/sdk";

const pulse = new AgentPulse();
const alive = await pulse.isAlive("0x9508752Ba171D37EBb3AA437927458E0a21D1e04");
console.log(alive ? "💓 Agent is alive" : "💀 Agent is dead");
```

That's it. No API key. No wallet. No config. The SDK reads directly from the Base mainnet PulseRegistry contract.

---

## Core Concepts

### 1. Liveness (Free — On-Chain Reads)

Every agent that integrates Agent Pulse calls `pulse()` periodically, burning PULSE tokens. The PulseRegistry records each pulse timestamp. If an agent's last pulse is within the TTL window (default 24 hours), it's alive.

```typescript
const pulse = new AgentPulse();

// Binary check
const alive = await pulse.isAlive("0x...");

// Full status (streak, hazard score, TTL)
const status = await pulse.getStatus("0x...");
console.log(`Streak: ${status.streak} days | Hazard: ${status.hazardScore}`);
```

### 2. Pulsing (On-Chain Write — Requires PULSE Tokens)

Agents prove liveness by calling `pulse()`, which burns 1 PULSE token and updates their on-chain record.

```typescript
const pulse = new AgentPulse({
  wallet: {
    address: "0xYourAgentAddress",
    privateKey: "0xYourPrivateKey",
  },
});

const { txHash, streak } = await pulse.beat();
console.log(`💓 Pulsed! tx: ${txHash} | streak: ${streak}`);
```

> **Requirements:** Your agent address needs PULSE tokens (available on [Uniswap V4 / Base](https://dexscreener.com/base/0x21111B39A502335aC7e45c4574Dd083A69258b07)) and a small amount of ETH on Base for gas.

### 3. Gating (Bidirectional Liveness Checks)

Protect your agent by requiring proof-of-life from peers before interacting.

```typescript
const pulse = new AgentPulse();
const gate = pulse.createGate({
  mode: "strict",       // "strict" | "warn" | "log"
  gateIncoming: true,   // reject requests from dead agents
  gateOutgoing: true,   // refuse to call dead agents
  threshold: "24h",     // custom liveness window
});

// In your request handler:
try {
  await gate.checkInbound(requesterAddress);
  // Agent is alive — proceed
} catch (err) {
  // err.error === "PULSE_REQUIRED"
  return res.status(403).json(err);
}
```

### 4. Paid Insights via x402 (USDC Micropayments)

Advanced analytics endpoints are protected by the [x402 payment protocol](https://www.x402.org/). When you call a paid endpoint, the SDK:

1. Makes the initial request → receives `402 Payment Required`
2. Parses the x402 challenge (price, recipient, asset)
3. Signs a USDC `transferWithAuthorization` (EIP-3009) — no approve tx needed
4. Retries the request with the `X-Payment` header
5. Server settles via Thirdweb facilitator → you get data

```
Agent SDK                    Agent Pulse API              Thirdweb Facilitator
    │                              │                              │
    ├─── GET /reliability ────────►│                              │
    │◄── 402 + x402 challenge ─────┤                              │
    │                              │                              │
    ├─── sign USDC EIP-3009 ──────►│                              │
    │    (X-Payment header)        ├─── settle payment ──────────►│
    │                              │◄── payment confirmed ────────┤
    │◄── 200 + reliability data ───┤                              │
```

```typescript
const pulse = new AgentPulse({
  wallet: {
    address: "0x...",
    signMessage: async (msg) => wallet.signMessage(msg),
  },
  x402: {
    serverWalletAddress: "0xdf42EC5803518b251236146289B311C39EDB0cEF",
  },
});

const reliability = await pulse.getReliability("0x...");
console.log(`Score: ${reliability.score}/100`);
```

### 5. Peer Attestation (On-Chain Reputation)

Agents can vouch for each other's behavior. The PeerAttestation contract records success/failure/timeout outcomes, building an on-chain reputation.

```typescript
// Wrap any inter-agent call with automatic attestation
const result = await pulse.getClient().attestation.withAttestation(
  "0xTargetAgent",
  async () => {
    return await callAgent("0xTargetAgent", task);
  },
  { timeoutMs: 30000 }
);
// ✅ success → positive attestation recorded on-chain
// ❌ failure → negative attestation recorded on-chain
// ⏱ timeout → timeout attestation recorded on-chain
```

---

## API Reference

### `AgentPulse` — Main Class

The simplified entry point. Wraps `AgentPulseClient` for common operations.

```typescript
import { AgentPulse } from "@agent-pulse/sdk";
const pulse = new AgentPulse(config?: AgentPulseClientConfig);
```

| Method | Returns | Cost | Description |
|--------|---------|------|-------------|
| `pulse.beat()` | `Promise<PulseResponse>` | PULSE token + gas | Send a heartbeat (burns 1 PULSE) |
| `pulse.pulse(amount?)` | `Promise<PulseResponse>` | PULSE token + gas | Send pulse with custom amount |
| `pulse.isAlive(address)` | `Promise<boolean>` | **Free** | Binary liveness check (on-chain) |
| `pulse.getStatus(address)` | `Promise<AgentStatus>` | **Free** | Full status: alive, streak, hazard, TTL |
| `pulse.getReliability(address)` | `Promise<ReliabilityScore>` | $0.01 USDC | Reliability score 0-100 |
| `pulse.getLivenessProof(address)` | `Promise<LivenessProof>` | $0.005 USDC | Signed liveness proof |
| `pulse.getGlobalStats()` | `Promise<GlobalStats>` | $0.03 USDC | Protocol-wide statistics |
| `pulse.getPeerCorrelation(address)` | `Promise<PeerCorrelation>` | $0.02 USDC | Peer cluster analysis |
| `pulse.getConfig()` | `Promise<ProtocolConfig>` | **Free** | Contract addresses, chain config |
| `pulse.getHealth()` | `Promise<ProtocolHealth>` | **Free** | Protocol health status |
| `pulse.getBalance(address?)` | `Promise<bigint>` | **Free** | PULSE token balance (on-chain) |
| `pulse.getClient()` | `AgentPulseClient` | — | Access underlying client |
| `pulse.createGate(options?)` | `AgentPulseGate` | — | Create a liveness gate |

### `AgentPulseClient` — Full Client

Lower-level client with direct access to all protocol operations.

```typescript
import { AgentPulseClient } from "@agent-pulse/sdk";
const client = new AgentPulseClient(config?: AgentPulseClientConfig);
```

**Additional methods beyond AgentPulse:**

| Method | Returns | Description |
|--------|---------|-------------|
| `client.getAgentStatus(address)` | `Promise<AgentStatus>` | Full on-chain agent status |
| `client.getProtocolConfig()` | `Promise<ProtocolConfig>` | Protocol configuration from API |
| `client.getProtocolHealth()` | `Promise<ProtocolHealth>` | Protocol health from API |
| `client.getAllowance(owner?)` | `Promise<bigint>` | PULSE allowance for PulseRegistry |
| `client.attestation.attest(addr, outcome)` | `Promise<AttestResponse>` | Submit peer attestation |
| `client.attestation.getReputation(addr)` | `Promise<Reputation>` | Get reputation (paid) |
| `client.attestation.getAttestations(addr)` | `Promise<AttestationList>` | List attestations (paid) |
| `client.attestation.withAttestation(addr, fn)` | `Promise<T>` | Auto-attest wrapper |

### `AgentPulseGate` — Bidirectional Gating

```typescript
const gate = new AgentPulseGate(client, options?: GateOptions);
```

| Method | Returns | Description |
|--------|---------|-------------|
| `gate.checkInbound(address)` | `Promise<void>` | Check requester liveness (throws `PulseRequiredError` in strict mode) |
| `gate.checkOutbound(address)` | `Promise<void>` | Check target liveness before calling |
| `gate.status()` | `GateStatus` | Current gate stats (mode, rejection counts) |
| `gate.setThreshold(threshold)` | `void` | Update liveness threshold |

**Gate Modes:**

| Mode | Dead Agent Behavior |
|------|-------------------|
| `"strict"` | Rejects with `PulseRequiredError` |
| `"warn"` | Logs warning, allows through |
| `"log"` | Silent log, always allows |

### x402 Payment Utilities

```typescript
import {
  signX402Payment,
  encodeX402PaymentHeader,
  decodeX402PaymentHeader,
  createTransferAuthorization,
  priceToMicroUsdc,
  microUsdcToPrice,
  generateNonce,
  X402PaymentHandler,
} from "@agent-pulse/sdk";
```

| Function | Description |
|----------|-------------|
| `signX402Payment({ from, to, price, sign })` | Create a signed USDC transfer authorization for x402 |
| `encodeX402PaymentHeader(auth)` | Base64-encode authorization for the `X-Payment` header |
| `decodeX402PaymentHeader(header)` | Decode a base64 `X-Payment` header |
| `createTransferAuthorization(params)` | Low-level EIP-3009 authorization creation |
| `priceToMicroUsdc(price)` | Convert `"$0.01"` → `10000n` (6 decimals) |
| `microUsdcToPrice(amount)` | Convert `10000n` → `"$0.010000"` |
| `generateNonce()` | Random 32-byte hex nonce |

### Types

```typescript
import type {
  AgentStatus,
  AgentPulseClientConfig,
  SDKConfig,
  WalletConfig,
  ProtocolConfig,
  ProtocolHealth,
  PulseParams,
  PulseResponse,
  ReliabilityScore,
  LivenessProof,
  GlobalStats,
  PeerCorrelation,
  TransferAuthorization,
  GateMode,
  GateOptions,
  GateStatus,
  PulseRequiredError,
} from "@agent-pulse/sdk";
```

### Constants

```typescript
import { DEFAULTS, ENDPOINT_PRICES, USDC_ADDRESSES, DEAD_ADDRESS } from "@agent-pulse/sdk";

DEFAULTS.BASE_URL        // "https://agent-pulse-nine.vercel.app"
DEFAULTS.CHAIN_ID        // 84532 (Base Sepolia — configure for Base mainnet)
DEFAULTS.PULSE_TOKEN     // "0x21111B39A502335aC7e45c4574Dd083A69258b07"
DEFAULTS.PULSE_REGISTRY  // "0xe61C615743A02983A46aFF66Db035297e8a43846"
DEFAULTS.TTL_SECONDS     // 86400 (24 hours)

ENDPOINT_PRICES.RELIABILITY      // "$0.01"
ENDPOINT_PRICES.LIVENESS_PROOF   // "$0.005"
ENDPOINT_PRICES.GLOBAL_STATS     // "$0.03"
ENDPOINT_PRICES.PEER_CORRELATION // "$0.02"

USDC_ADDRESSES[8453]   // Base mainnet USDC
USDC_ADDRESSES[84532]  // Base Sepolia USDC

DEAD_ADDRESS // "0x000000000000000000000000000000000000dEaD"
```

### Error Handling

```typescript
import { AgentPulseError } from "@agent-pulse/sdk";

try {
  await pulse.beat();
} catch (err) {
  if (err instanceof AgentPulseError) {
    console.error(`[${err.code}] ${err.message}`);
    // err.code: "PAYMENT_REQUIRED" | "INVALID_ADDRESS" | "INSUFFICIENT_BALANCE"
    //           | "TRANSACTION_FAILED" | "API_ERROR" | "NETWORK_ERROR"
    //           | "TIMEOUT" | "NOT_IMPLEMENTED" | "UNKNOWN"
    // err.statusCode: HTTP status (if API error)
    // err.cause: Original error
  }
}
```

---

## Configuration

```typescript
const pulse = new AgentPulse({
  // API base URL (default: production)
  baseUrl: "https://agent-pulse-nine.vercel.app",

  // Chain ID: 8453 = Base Mainnet, 84532 = Base Sepolia
  chainId: 8453,

  // Custom RPC endpoint (optional — uses chain default otherwise)
  rpcUrl: "https://mainnet.base.org",

  // Contract overrides (optional — uses verified defaults)
  contracts: {
    pulseToken: "0x21111B39A502335aC7e45c4574Dd083A69258b07",
    pulseRegistry: "0xe61C615743A02983A46aFF66Db035297e8a43846",
  },

  // Wallet for transactions (optional — only needed for pulse/attest/paid calls)
  wallet: {
    address: "0x...",
    privateKey: "0x...",               // Direct signing
    // OR
    signMessage: async (msg) => "0x...", // External signer
    signTypedData: async (...) => "0x...",
  },

  // x402 payment config (optional — only for paid endpoints)
  x402: {
    facilitatorUrl: "https://api.thirdweb.com/v1/payments/x402",
    serverWalletAddress: "0xdf42EC5803518b251236146289B311C39EDB0cEF",
  },
});
```

---

## Protocol Details

### Contracts (Base Mainnet — All Verified on BaseScan)

| Contract | Address |
|----------|---------|
| **PULSE Token** (Clanker V4) | [`0x21111B39A502335aC7e45c4574Dd083A69258b07`](https://basescan.org/address/0x21111B39A502335aC7e45c4574Dd083A69258b07) |
| **PulseRegistryV2** | [`0xe61C615743A02983A46aFF66Db035297e8a43846`](https://basescan.org/address/0xe61C615743A02983A46aFF66Db035297e8a43846) |
| **PeerAttestation** | [`0x930dC6130b20775E01414a5923e7C66b62FF8d6C`](https://basescan.org/address/0x930dC6130b20775E01414a5923e7C66b62FF8d6C) |
| **BurnWithFee** | [`0xd38cC332ca9755DE536841f2A248f4585Fb08C1E`](https://basescan.org/address/0xd38cC332ca9755DE536841f2A248f4585Fb08C1E) |

### Free API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/v2/agent/{address}/alive` | Binary liveness + staleness + streak |
| `GET /api/status/{address}` | Full status with hazard score |
| `GET /api/protocol-health` | Protocol health (KV, RPC, pause) |
| `GET /api/config` | Chain config + contract addresses |

### Paid API Endpoints (x402 — USDC on Base)

| Endpoint | Price | Description |
|----------|-------|-------------|
| `GET /api/v2/agent/{address}/reliability` | $0.01 | Reliability score, tier, streak analysis |
| `GET /api/v2/agent/{address}/streak-analysis` | $0.008 | Streak consistency, MTBD |
| `GET /api/v2/agent/{address}/uptime-metrics` | $0.01 | Uptime heatmaps, historical availability |

### How Pulsing Works

```
Agent → approve(PULSE, Registry) → PulseRegistryV2.pulse(amount)
                                          │
                                          ├── Burns PULSE to 0x...dEaD
                                          ├── Updates lastPulseAt + streak
                                          └── Emits PulseV2 event

Anyone → PulseRegistryV2.isAlive(agent) → true/false (free read)
```

---

## Badge & Status Embed

Use the free alive endpoint to build status badges or monitoring dashboards:

```bash
# Check any agent (returns JSON)
curl https://agent-pulse-nine.vercel.app/api/v2/agent/0x9508752Ba171D37EBb3AA437927458E0a21D1e04/alive
```

```json
{
  "address": "0x9508752ba171d37ebb3aa437927458e0a21d1e04",
  "isAlive": true,
  "lastPulseTimestamp": 1770505235,
  "streak": 1,
  "staleness": 2641,
  "ttl": 86400,
  "checkedAt": "2026-02-07T23:44:36.085Z"
}
```

**Markdown badge example:**

```markdown
![Agent Status](https://img.shields.io/endpoint?url=https://agent-pulse-nine.vercel.app/api/v2/agent/YOUR_ADDRESS/alive&label=pulse&color=brightgreen)
```

**HTML embed:**

```html
<img src="https://img.shields.io/badge/dynamic/json?url=https://agent-pulse-nine.vercel.app/api/v2/agent/YOUR_ADDRESS/alive&query=$.isAlive&label=Agent%20Pulse&trueColor=brightgreen&falseColor=red&trueLabel=alive&falseLabel=dead" />
```

---

## Examples

See the [`examples/`](./examples/) directory for runnable TypeScript scripts:

- **[basic-alive-check.ts](./examples/basic-alive-check.ts)** — Check if a single agent is alive
- **[batch-check-agents.ts](./examples/batch-check-agents.ts)** — Check multiple agents in parallel
- **[monitor-agent-uptime.ts](./examples/monitor-agent-uptime.ts)** — Continuous monitoring loop with alerts

Run any example:

```bash
npx tsx examples/basic-alive-check.ts
```

---

## Links

- **Live Dashboard:** [agent-pulse-nine.vercel.app](https://agent-pulse-nine.vercel.app)
- **GitHub:** [github.com/consensus-hq/agent-pulse](https://github.com/consensus-hq/agent-pulse)
- **PULSE Token:** [DexScreener](https://dexscreener.com/base/0x21111B39A502335aC7e45c4574Dd083A69258b07)
- **x402 Protocol:** [x402.org](https://www.x402.org/)
- **Twitter:** [@PulseOnBase](https://x.com/PulseOnBase)

---

## License

MIT © [Consensus HQ](https://github.com/consensus-hq)
