# Agent Pulse — Features, Integrations & Vendors Inventory

**Last Updated:** 2026-02-05

---

## Features

### Core Protocol
| Feature | Status | Description |
|---------|--------|-------------|
| `pulse()` | ✅ Live | Send PULSE tokens to prove liveness |
| `isAlive()` | ✅ Live | Binary liveness check (TTL-based) |
| Streak Tracking | ✅ Live | Consecutive day pulse counter |
| Hazard Score | ✅ Live | Admin-settable risk score (0-100) |
| Emergency Pause | ✅ Live | Owner can pause/unpause protocol |
| Token Burn | ✅ Live | All pulses burn to `0x...dEaD` |

### Frontend
| Feature | Status | Description |
|---------|--------|-------------|
| Wallet Connect | ✅ Live | RainbowKit + WalletConnect v2 |
| Status Query | ✅ Live | Check any agent's liveness |
| Pulse Feed | ✅ Live | Real-time on-chain events |
| ERC-8004 Panel | ⚠️ Partial | UI built, queries not wired |
| DeFi Panel | ⚠️ Partial | UI built, needs env var |
| Inbox System | ⚠️ Partial | Auth works, no persistence |

### API
| Endpoint | Status | Description |
|----------|--------|-------------|
| `/api/status/{address}` | ✅ Live | Agent liveness + metadata |
| `/api/pulse-feed` | ✅ Live | Paginated event feed |
| `/api/protocol-health` | ✅ Live | KV + RPC health check |
| `/api/docs` | ✅ Live | OpenAPI 3.1.0 spec |
| `/api/defi` | ❌ 500 | Needs `HEYELSA_X402_API_URL` |

---

## Integrations

### Blockchain
| Integration | Version | Purpose | Status |
|-------------|---------|---------|--------|
| Base Sepolia | Chain 84532 | Testnet deployment | ✅ Live |
| Base Mainnet | Chain 8453 | Production (planned) | ⏳ Blocked |
| Thirdweb SDK | v5.118.1 | Chain reads/writes | ✅ Live |
| Thirdweb Insight | API | Event indexing | ✅ Live |

### Wallet
| Integration | Version | Purpose | Status |
|-------------|---------|---------|--------|
| RainbowKit | v2.2.4 | Wallet modal UI | ✅ Live |
| wagmi | v2.19.5 | React hooks for Ethereum | ✅ Live |
| WalletConnect | v2 | Multi-wallet support | ✅ Live |
| viem | v2.45.1 | TypeScript Ethereum client | ✅ Live |

### Infrastructure
| Integration | Purpose | Status |
|-------------|---------|--------|
| Vercel | Hosting + Edge Functions | ✅ Live |
| Vercel KV | Caching + Rate Limiting | ✅ Live |
| GitHub Actions | CI/CD | ✅ Live |

### Planned / Partial
| Integration | Purpose | Status |
|-------------|---------|--------|
| HeyElsa x402 | DeFi micropayments | ⚠️ Env var missing |
| ERC-8004 | Identity/Reputation registries | ⚠️ Not wired |
| Forta | On-chain monitoring | ❌ Not configured |

---

## Vendors / Dependencies

### Smart Contracts
| Vendor | Package | Version | License |
|--------|---------|---------|---------|
| OpenZeppelin | @openzeppelin/contracts | v5.0.2 | MIT |
| Foundry | forge-std | latest | MIT |

### Frontend
| Vendor | Package | Version | License |
|--------|---------|---------|---------|
| Vercel | Next.js | 15.1.6 | MIT |
| Rainbow | @rainbow-me/rainbowkit | 2.2.4 | MIT |
| Wevm | wagmi | 2.19.5 | MIT |
| Wevm | viem | 2.45.1 | MIT |
| Thirdweb | thirdweb | 5.118.1 | Apache-2.0 |
| TanStack | @tanstack/react-query | 5.x | MIT |

### Testing
| Vendor | Package | Version | Purpose |
|--------|---------|---------|---------|
| Foundry | forge | 1.0.0 | Contract testing |
| Vitest | vitest | 4.0.18 | Unit/integration tests |
| Playwright | @playwright/test | 1.58.1 | E2E tests |

### Infra / Services
| Vendor | Service | Purpose |
|--------|---------|---------|
| Vercel | Hosting | Frontend + API |
| Vercel | KV (Redis) | Caching |
| GitHub | Actions | CI/CD |
| BaseScan | Explorer | Contract verification |
| WalletConnect | Cloud | Wallet relay |

---

## Contract Addresses (Base Sepolia)

| Contract | Address | Verified |
|----------|---------|----------|
| PulseToken | `0x7f24C286872c9594499CD634c7Cc7735551242a2` | ✅ |
| PulseRegistry | `0x2C802988c16Fae08bf04656fe93aDFA9a5bA8612` | ✅ |
| Signal Sink | `0x000000000000000000000000000000000000dEaD` | N/A |
| Treasury Safe | `0xA7940a42c30A7F492Ed578F3aC728c2929103E43` | ✅ |

---

## Test Coverage

| Suite | Tests | Pass Rate |
|-------|-------|-----------|
| Foundry (contracts) | 73 | 100% |
| Vitest (API/utils) | 56 | 100% |
| Playwright (E2E) | 8 | 100% |
| **Total** | **137** | **100%** |

---

## Links

- **Live Demo:** https://agent-pulse-nine.vercel.app
- **GitHub:** https://github.com/consensus-hq/agent-pulse
- **BaseScan (Token):** https://sepolia.basescan.org/address/0x7f24C286872c9594499CD634c7Cc7735551242a2
- **BaseScan (Registry):** https://sepolia.basescan.org/address/0x2C802988c16Fae08bf04656fe93aDFA9a5bA8612
