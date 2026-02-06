# Wallet Registry — Agent Pulse

> Single source of truth for every wallet in the system. Updated 2026-02-06.

| Label | Address | Purpose | Risk Level | Notes |
|-------|---------|---------|------------|-------|
| **Deployer** | `0x9508752Ba171D37EBb3AA437927458E0a21D1e04` | Contract deployments, owner of PulseToken + PulseRegistry | 🔴 CRITICAL | Holds owner role. Key stored offline. Must never be in server env. |
| **Server Wallet** | `0xdf42EC5803518b251236146289B311C39EDB0cEF` | Thirdweb Engine server wallet for automated x402 facilitation & keeper ops | 🟡 HIGH | Managed by Thirdweb; used for runtime transactions. Budget-capped. |
| **Fee Wallet** | *Derived from BurnWithFee contract* (see LINKS.md / contract source) | Receives 1% of every burn-with-fee pulse | 🟢 LOW | Accumulates PULSE only. No private key exposure — funds flow to Safe. |
| **Safe (Treasury)** | `0xA7940a42c30A7F492Ed578F3aC728c2929103E43` | Multi-sig treasury for protocol funds | 🟢 LOW | Gnosis Safe. Requires multiple signers. |
| **Dead Address (Burn Sink)** | `0x000000000000000000000000000000000000dEaD` | Permanent token burn destination — 99% of pulse signals | ⚪ NONE | No private key exists. Tokens sent here are irreversibly destroyed. |

## Testnet Contracts (Base Sepolia — Chain 84532)

| Contract | Address | Status |
|----------|---------|--------|
| PulseToken | `0x21111B39A502335aC7e45c4574Dd083A69258b07` | ✅ Verified |
| PulseRegistry | `0xe61C615743A02983A46aFF66Db035297e8a43846` | ✅ Verified |

## Mainnet Contracts (Base)

| Contract | Address | Status |
|----------|---------|--------|
| PulseToken | TBD | Pending launch |
| PulseRegistry | TBD | Pending launch |
| BurnWithFee | TBD | Pending launch |

## ERC-8004 Registries (Base Mainnet)

| Registry | Address |
|----------|---------|
| Identity Registry | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` |
| Reputation Registry | `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` |

## Rules

- **Never hardcode addresses in application code.** Use env vars or reference `LINKS.md`.
- Deployer key must never touch a server environment. Deployment is manual, local-only.
- Server Wallet has a **$1/day budget ceiling** enforced by Thirdweb Engine config.
- No DEX-related wallets at launch.
