# Agent Pulse 🫀

[![Tests](https://img.shields.io/badge/tests-65%2F65%20passing-success)](./packages/contracts/test)
[![Audit](https://img.shields.io/badge/security-audited-blue)](./REPORTS)
[![License](https://img.shields.io/badge/license-Apache--2.0-green)](./LICENSE)
[![Base](https://img.shields.io/badge/base-L2-blue)](https://base.org)

> **Pulse a token, stay routable** — the simplest honest signal an AI agent can send.

Agent Pulse is a paid-liveness protocol for AI agents on Base (Ethereum L2). Agents send $PULSE utility tokens to the signal sink to signal "I'm here, route work to me." No pulse within the TTL window → agent drops off the routing table.

**Live Demo:** [https://agent-pulse-nine.vercel.app](https://agent-pulse-nine.vercel.app)

---

## What It Does

- **Pulse Registry:** On-chain activity signal that proves agent liveness
- **Routing Gate:** Binary eligibility check (`isAlive`) that any marketplace can query
- **Agent Inbox:** Short-lived inbox keys gated by pulse status
- **ERC-8004 Integration:** Optional identity verification via Base registries
- **Anti-Spam by Design:** Paid signals discourage low-effort spam without complex reputation systems

## Features

- **Wallet Connect:** wagmi v2 + RainbowKit integration for one-click wallet onboarding.
- **Persistent, secured inbox:** Vercel KV-backed storage with signature auth, TTL enforcement, and request throttling.
- **ERC-8004 live identity panel:** Real-time identity and reputation registry data surfaced in the UI.
- **API hardening:** RPC timeouts, per-route traffic caps, and explicit 503 responses on upstream failures.
- **Deploy pipeline:** automated scripts (`scripts/deploy-token.ts`, `scripts/deploy-all.ts`) plus env wiring.
- **Brand design system:** shared tokens, typography, and component styles for consistent UI.

## Who It's For

| User | Use Case |
|------|----------|
| **AI Agents** | Autonomous wallets that need to signal availability for tasks |
| **Agent Marketplaces** | Filter routable agents by on-chain liveness |
| **Developers** | Add liveness gating to any agent directory or task router |
| **Researchers** | Study agent activity patterns via public on-chain signals |

---

## Quick Start

### Prerequisites
- Node.js 20+
- Foundry (for contract development)
- Base Sepolia ETH (for testnet)

### Clone & Install

```bash
git clone https://github.com/consensus-hq/agent-pulse.git
cd agent-pulse

# Install web dependencies
cd apps/web
npm install

# Start dev server
npm run dev
```

### Environment Setup

```bash
cp .env.example .env.local
# Fill in your RPC URL and contract addresses
```

Required environment variables:
```env
# Client-side (browser)
NEXT_PUBLIC_PULSE_TOKEN_ADDRESS=0x...
NEXT_PUBLIC_SIGNAL_ADDRESS=0x000000000000000000000000000000000000dEaD
NEXT_PUBLIC_PULSE_REGISTRY_ADDRESS=0x...
NEXT_PUBLIC_BASE_RPC_URL=https://...

# Server-side
PULSE_TOKEN_ADDRESS=0x...
SIGNAL_ADDRESS=0x...
BASE_RPC_URL=https://...
```

### Contract Development

```bash
cd packages/contracts

# Install dependencies
forge install

# Run tests
forge test

# Run tests with gas report
forge test --gas-report

# Deploy to testnet
forge script script/Deploy.s.sol --rpc-url $BASE_RPC_URL --broadcast
```

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         AGENT PULSE SYSTEM                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────┐     ┌──────────────┐     ┌─────────────────┐  │
│  │   Agent     │────▶│   $PULSE     │────▶│   Signal Sink   │  │
│  │   Wallet    │     │   Token      │     │   (0x...dEaD)   │  │
│  └─────────────┘     └──────────────┘     └─────────────────┘  │
│         │                                                   │    │
│         │         Pulse Event (Transfer)                    │    │
│         ▼                                                   ▼    │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │              PulseRegistry Contract                         │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐    │ │
│  │  │  isAlive()  │  │   Streak    │  │  Hazard Score   │    │ │
│  │  │  (TTL check)│  │   Counter   │  │  (0-100)        │    │ │
│  │  └─────────────┘  └─────────────┘  └─────────────────┘    │ │
│  └────────────────────────────────────────────────────────────┘ │
│         │                                                       │
│         ▼                                                       │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                    API Layer (Next.js)                      │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │ │
│  │  │/status/* │  │/pulse-feed│  │/inbox-key│  │/inbox/*  │   │ │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │ │
│  └────────────────────────────────────────────────────────────┘ │
│         │                                                       │
│         ▼                                                       │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                    Frontend (React)                         │ │
│  │         Eligibility Dashboard + Pulse Feed                  │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Agent pulses** → Transfers $PULSE to signal sink
2. **Registry captures** → Pulse event recorded with timestamp
3. **Status check** → `isAlive()` evaluates true if within TTL window
4. **Inbox unlock** → Living agents get short-lived API keys
5. **Routing** → Marketplaces query status to filter eligible agents

---

## API Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/pulse` | POST | Submit a pulse signal (x402-protected) |
| `/api/status/{address}` | GET | Get agent liveness status |
| `/api/pulse-feed` | GET | Recent pulse events (Insight API) |
| `/api/protocol-health` | GET | Protocol health + KV/RPC status |
| `/api/pulse-webhook` | POST | Insight webhook receiver |
| `/api/defi` | GET | HeyElsa DeFi proxy (token data, portfolio) |
| `/api/inbox-key` | POST | Create inbox key (requires pulse) |
| `/api/inbox/{wallet}` | GET/POST | Read/write agent inbox (gated) |

### x402 Micropayment Flow

The `/api/pulse` endpoint uses the [x402 protocol](https://www.x402.org/) for HTTP-native micropayments:

1. Agent calls `POST /api/pulse` → receives `402 Payment Required`
2. Agent signs EIP-712 permit authorizing PULSE token transfer
3. Agent retries with `PAYMENT-SIGNATURE` header
4. Facilitator settles on-chain → PULSE burns to signal sink
5. Streak updated, agent stays routable

See [X402_API_GUIDE.md](./docs/X402_API_GUIDE.md) for complete documentation.

---

## Contract Addresses

> All addresses are also available in [LINKS.md](./LINKS.md)

| Contract | Base Mainnet | Base Sepolia |
|----------|--------------|--------------|
| $PULSE Token | TBD | `0x7f24C286...1242a2` |
| PulseRegistry | TBD | `0x2C802988...8612` |
| Signal Sink | `0x0000...dEaD` | `0x0000...dEaD` |
| Identity Registry (ERC-8004) | `0x8004...A432` | — |

---

## Key Features

### 📡 Pulse-to-Signal
- **1 PULSE** minimum to pulse
- Tokens are **consumed** (sent to signal sink)
- No recoverable treasury from pulse signals

### ⏱️ TTL-Based Liveness
- Default: **24 hours** (`86400` seconds)
- Configurable by contract owner (max 30 days)
- Binary check: `now - lastPulseAt <= TTL`

### 🔥 Streak System
- Daily pulses increment streak counter
- Miss a day → streak resets to 1
- Visible on dashboard and API

### 🛡️ Security
- 65/65 tests passing
- ReentrancyGuard on all state-changing functions
- CEI pattern (Checks-Effects-Interactions)
- Pausable by owner
- Security audit completed

---

## Repository Structure

```
agent-pulse/
├── apps/
│   └── web/                 # Next.js frontend + API routes
│       ├── src/app/api/     # REST API endpoints
│       ├── src/app/lib/     # Server utilities
│       └── src/components/  # React components
├── brand/                   # Design system assets
├── packages/
│   └── contracts/           # Foundry/Solidity contracts
│       ├── contracts/       # PulseRegistry.sol
│       ├── test/            # Test suite (65 tests)
│       └── script/          # Deployment scripts
├── docs/                    # Documentation
├── scripts/                 # Fork + Tenderly harnesses
└── REPORTS/                 # Security audit + notes
```

---

## Compliance & Policy

- **$PULSE** is a utility token for pulse signals only
- No trading or speculation language; no claims of financial upside
- No DEX links at launch
- No liquidity management promises
- A pulse shows recent wallet activity — it does **not** prove identity, quality, or "AI"

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

## License

Apache-2.0 — see [LICENSE](./LICENSE)

---

## Resources

| Resource | Link |
|----------|------|
| Live Demo | https://agent-pulse-nine.vercel.app |
| GitHub | https://github.com/consensus-hq/agent-pulse |
| X/Twitter | https://x.com/PulseOnBase |
| Base | https://base.org |

---

*Built for the OpenClaw ecosystem — autonomous agents need reliable signals.*
