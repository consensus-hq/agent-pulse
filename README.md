# Agent Pulse 🫀

Agent Pulse is an **on-chain liveness protocol** for AI agents on **Base**.
Routers get a **free `isAlive(address)` check** to avoid routing tasks to dead agents.
Workers **pulse (burn 1 $PULSE/day)** to stay visible; liveness intelligence is designed to be served via **x402 (USDC micropayments)**.

**Live demo:** https://agent-pulse-nine.vercel.app

---

## Quickstart (curl the free liveness endpoint)

```bash
curl \
  https://agent-pulse-nine.vercel.app/api/v2/agent/0x7f24C286872c9594499CD634c7Cc7735551242a2/alive \
  | jq
```

Example response shape:

```json
{
  "address": "0x7f24c286872c9594499cd634c7cc7735551242a2",
  "isAlive": true,
  "lastPulseTimestamp": 1738832400,
  "streak": 12,
  "staleness": 3600,
  "ttl": 86400,
  "checkedAt": "2026-02-06T14:31:22.123Z"
}
```

---

## Why

AI agents are shipped like APIs: they go down, stall, or silently stop responding.
Off-chain health checks are easy to spoof and hard to compose.

Agent Pulse provides a shared, permissionless primitive:
- **Primitive:** `isAlive(address)` — deterministic on-chain boolean
- **Router rule:** “no pulse, no routing”
- **Composable:** can be combined with identity/reputation registries

Source narrative: [`shared/agent-9-narrative/CORE_NARRATIVE.md`](./shared/agent-9-narrative/CORE_NARRATIVE.md)

---

## Architecture (high level)

```mermaid
flowchart TB
  subgraph OnChain[On-chain (Base Sepolia)]
    A[Agent wallet] -->|pulse| R[PulseRegistry / BurnWithFee]
    R --> S[signal sink\n0x0000...dEaD]
  end

  subgraph API[API (Vercel / Next.js)]
    L[GET /api/v2/agent/:addr/alive\nFREE] --> C[read PulseRegistry.getAgentStatus]
  end

  A --> L

  subgraph Future[Designed for v4]
    I[Indexer + cache] --> P[x402-gated endpoints\n(USDC micropayments)]
  end
```

---

## Contracts (Base Sepolia)

Canonical list: [`LINKS.md`](./LINKS.md)

| Contract | Address | Explorer |
|---|---:|---|
| PulseToken | `0x7f24C286872c9594499CD634c7Cc7735551242a2` | https://sepolia.basescan.org/address/0x7f24c286872c9594499cd634c7cc7735551242a2 |
| PulseRegistry V1 (API default) | `0x2C802988c16Fae08bf04656fe93aDFA9a5bA8612` | https://sepolia.basescan.org/address/0x2c802988c16fae08bf04656fe93adfa9a5ba8612 |
| PulseRegistryV2 | `0xe61C615743A02983A46aFF66Db035297e8a43846` | https://base-sepolia.blockscout.com/address/0xe61c615743a02983a46aff66db035297e8a43846 |
| BurnWithFee | `0xd38cC332ca9755DE536841f2A248f4585Fb08C1E` | https://base-sepolia.blockscout.com/address/0xd38cc332ca9755de536841f2a248f4585fb08c1e |
| PeerAttestation | `0x930dC6130b20775E01414a5923e7C66b62FF8d6C` | https://base-sepolia.blockscout.com/address/0x930dc6130b20775e01414a5923e7c66b62ff8d6c |

- Chain ID: `84532`
- RPC: https://sepolia.base.org

---

## Tech stack

- Next.js 16 / React
- Vercel
- Solidity + Foundry
- viem / wagmi / RainbowKit
- Base (Sepolia for hackathon)
- x402 (designed)

---

## Docs

- 5-minute integration: [`docs/QUICKSTART.md`](./docs/QUICKSTART.md)
- API reference (judge-friendly): [`docs/API_REFERENCE.md`](./docs/API_REFERENCE.md)

---

## Repo layout

```text
agent-pulse/
├── apps/web/                  # Next.js app + API
├── packages/contracts/        # Foundry contracts
├── packages/sdk/              # SDK
├── packages/pulse-filter/     # Router filter
└── docs/                      # Specs + runbooks
```

---

## Local development

```bash
pnpm install
cd apps/web
cp .env.example .env.local
pnpm dev
```

Contracts:

```bash
cd packages/contracts
forge test -vv
```

---

## License

MIT — see [LICENSE](./LICENSE).
