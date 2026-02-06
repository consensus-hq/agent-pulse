# Agent Pulse ⚡

**On-chain liveness signal for AI agents on Base.**

> Is this agent alive right now? One free API call. One answer.

```bash
curl https://agent-pulse-nine.vercel.app/api/v2/agent/0x9508752Ba171D37EBb3AA437927458E0a21D1e04/alive
```

```json
{
  "isAlive": true,
  "lastPulseTimestamp": 1770311798,
  "streak": 1,
  "staleness": 76412,
  "ttl": 86400
}
```

## The Problem

Agent routing without a liveness check is flying blind. You don't know if the agent you're sending work to is still online, still responsive, still real.

## The Solution

Agent Pulse is a public routing primitive. Agents pulse on-chain to prove they're active. Miss the TTL window = dropped from the routing table.

- **Free tier**: `isAlive()` — binary liveness check, open to everyone
- **Paid tier**: Derivative liveness intelligence via [x402](https://www.x402.org/) micropayments (USDC)

## Live Demo

🌐 **[agent-pulse-nine.vercel.app](https://agent-pulse-nine.vercel.app)**

## API Endpoints

### Free (no auth required)

| Endpoint | Method | Description |
|---|---|---|
| `/api/v2/agent/{address}/alive` | GET | Binary liveness + staleness + streak |
| `/api/status/{address}` | GET | Full agent status with hazard score |

### Paid (x402 — USDC on Base)

| Endpoint | Price | Description |
|---|---|---|
| `/api/paid/health` | $0.001 | Protocol health metrics |
| `/api/paid/portfolio` | $0.02 | Agent portfolio data |
| `/api/paid/price/{token}` | $0.005 | Token price data |

Paid endpoints return a `402 Payment Required` with x402 challenge details.

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│  AI Agent    │────▶│  PulseToken  │────▶│  PulseRegistry  │
│  (pulsing)   │     │  (ERC-20)    │     │  (on-chain)     │
└─────────────┘     └──────────────┘     └─────────────────┘
                                                │
                    ┌──────────────┐             │
                    │  Signal Sink │◀────────────┘
                    │  (0x...dEaD) │   1 PULSE per pulse
                    └──────────────┘
                                                │
┌─────────────┐     ┌──────────────┐            ▼
│  Consumer   │────▶│  Agent Pulse │     ┌─────────────────┐
│  (querying)  │     │  API (v2)    │────▶│  Liveness Data  │
└─────────────┘     └──────────────┘     └─────────────────┘
```

1. Agent sends 1 PULSE token to the signal sink (dead address)
2. PulseRegistry records the pulse timestamp on-chain
3. Anyone queries `isAlive(agent)` for free — returns liveness + staleness
4. Paid endpoints provide derivative intelligence (streaks, reliability, predictions)

## Contracts (Base Mainnet)

| Contract | Address |
|---|---|
| PULSE Token (Clanker V4) | [`0x21111B39A502335aC7e45c4574Dd083A69258b07`](https://basescan.org/address/0x21111B39A502335aC7e45c4574Dd083A69258b07) |
| PulseRegistryV2 | [`0xe61C615743A02983A46aFF66Db035297e8a43846`](https://basescan.org/address/0xe61C615743A02983A46aFF66Db035297e8a43846) |
| PeerAttestation | [`0x930dC6130b20775E01414a5923e7C66b62FF8d6C`](https://basescan.org/address/0x930dC6130b20775E01414a5923e7C66b62FF8d6C) |
| BurnWithFee | [`0xd38cC332ca9755DE536841f2A248f4585Fb08C1E`](https://basescan.org/address/0xd38cC332ca9755DE536841f2A248f4585Fb08C1E) |
| Treasury Safe | [`0xA7940a42c30A7F492Ed578F3aC728c2929103E43`](https://basescan.org/address/0xA7940a42c30A7F492Ed578F3aC728c2929103E43) |

## Tech Stack

- **Chain**: Base (Ethereum L2)
- **Contracts**: Solidity, Foundry (202 tests passing)
- **API**: Next.js 15, Vercel
- **Payments**: x402 protocol (HTTP-native micropayments)
- **DeFi**: HeyElsa integration
- **Tests**: 202 Foundry + 98 Vitest + E2E

## Quick Start (5 minutes)

### 1. Check if an agent is alive

```bash
curl https://agent-pulse-nine.vercel.app/api/v2/agent/YOUR_AGENT_ADDRESS/alive
```

### 2. Get full agent status

```bash
curl https://agent-pulse-nine.vercel.app/api/status/YOUR_AGENT_ADDRESS
```

### 3. Try a paid endpoint (will return 402 challenge)

```bash
curl -i https://agent-pulse-nine.vercel.app/api/paid/health
```

## Development

```bash
# Install
pnpm install

# Run web app
cd apps/web && pnpm dev

# Run contract tests
cd packages/contracts && forge test -vvv

# Run web tests
cd apps/web && npx vitest run
```

## Links

- **Live**: [agent-pulse-nine.vercel.app](https://agent-pulse-nine.vercel.app)
- **GitHub**: [github.com/consensus-hq/agent-pulse](https://github.com/consensus-hq/agent-pulse)
- **X**: [@PulseOnBase](https://x.com/PulseOnBase)

---

Built for [ClawdKitchen](https://clawd.kitchen) hackathon on Base.
