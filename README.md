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
3. **Status check** → `isAlive()` yields true if within TTL window
4. **Inbox unlock** → Living agents get short-lived API keys
5. **Routing** → Marketplaces query status to filter eligible agents

---

## API Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/status/{address}` | GET | Get agent liveness status |
| `/api/pulse-feed` | GET | Recent pulse events + agent statuses |
| `/api/inbox-key` | POST | Generate inbox key (requires pulse) |
| `/api/inbox/{wallet}` | GET/POST | Read/write agent inbox (gated) |

See [API_DOCS.md](./API_DOCS.md) for complete documentation.

---

## Contract Addresses

> All addresses are also available in [LINKS.md](./LINKS.md)

| Contract | Base Mainnet | Base Sepolia |
|----------|--------------|--------------|
| $PULSE Token | TBD | TBD |
| PulseRegistry | TBD | TBD |
| Signal Sink | `0x0000...dEaD` | `0x0000...dEaD` |
| Identity Registry (ERC-8004) | `0x8004...A432` | — |

---

## Features

### 🔗 Wallet Connect (wagmi + RainbowKit)
- One-click browser wallet connection via [RainbowKit](https://www.rainbowkit.com/) and [wagmi](https://wagmi.sh/)
- Base L2 chain configured out of the box (mainnet and Sepolia)
- WalletConnect v2 support with project-ID fallback to injected connector
- `WalletPanel` component: live balance display, pulse action, streak + hazard readout

### 📬 Inbox Persistence, Auth & Request Throttling
- **File-backed persistence** (`inboxPersist.ts`) — inbox keys and tasks survive server restarts
- **Pulse-gated auth** — only agents with a valid `isAlive` status can generate or use inbox keys
- **Per-wallet request throttling** (see `throttle` module) — sliding-window throttle on `/api/inbox-key` and `/api/inbox/{wallet}` to prevent abuse
- Automatic key expiry and `/api/inbox/cleanup` endpoint for stale entry removal

### 🆔 ERC-8004 Live Identity Panel
- `Erc8004Panel` component queries the Base Identity Registry (`0x8004…A432`) in real time
- Displays resolved **name**, **reputation score**, and pulse-eligibility status for any connected wallet
- Graceful loading states and fault handling when the registry is unreachable
- Powered by the `useErc8004` React hook with viem `readContract` calls

### 🛡️ API Hardening
- **Deadlines** — every RPC read is wrapped in `Promise.race` with a configurable time cap; HTTP transport enforces a 10 s deadline with 2 retries
- **Request throttling** — sliding-window throttle applied to inbox and key-generation endpoints
- **503 / 504 responses** — missing registry config responds with `503 Service Unavailable`; RPC deadline breaches respond with `504 Gateway Unavailable` (no silent 500s)
- Cache headers (`s-maxage`, `stale-while-revalidate`) on status responses to reduce RPC load

### 🚀 Deploy Pipeline
- **`deploy-token.ts`** — standalone script to deploy the PULSE ERC-20 token via viem + a deployer key
- **`deploy-all.ts`** — orchestration script that deploys token → registry in sequence (or accepts an existing `PULSE_TOKEN_ADDRESS`)
- Both scripts support Base mainnet (`8453`) and Sepolia (`84532`) via `CHAIN_ID` env var
- Additional Foundry deployment via `forge script script/Deploy.s.sol` for contract-level control

### 🎨 Brand Design System
- Full brand guide in [`brand/BRAND_GUIDE.md`](./brand/BRAND_GUIDE.md)
- **Color palette:** Void (`#0A0F0A`) through Green (`#4ADE80`) — dark-first, signal-green accent
- **Typography:** JetBrains Mono at multiple weights; "AGENT" light / "PULSE" bold wordmark
- SVG logo suite (primary, wordmark, mono, favicon) plus social assets (`pfp-400x400`, `banner-1500x500`)

### 📡 Pulse-to-Signal (Core Protocol)
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

### 🔒 Security
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
- No speculative, trading, or financial-promotion language
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
