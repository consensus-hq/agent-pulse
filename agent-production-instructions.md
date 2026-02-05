# Agent Instructions — Production Protocol Resolution

## Prime Directive

**NO MOCKS. NO STUBS. NO FILES. NO IN-MEMORY CACHES.**

Every piece of state flows through real infrastructure. Every test runs against real contracts. Every API call hits a real service. If something requires a mock to work, the architecture is wrong — fix the architecture.

---

## Available Infrastructure (Pro Accounts)

You have three pro-tier accounts. Use them. Do not reinvent what they already provide.

### Thirdweb Pro
- **SDK:** `thirdweb` v5.118.1 — contract reads, writes, event queries, wallet management
- **Insight API:** `https://<chainId>.insight.thirdweb.com` — indexed event scanning, decoded logs, aggregation, webhooks. This replaces `getLogs` and any custom indexer. Use it for ALL event queries.
  - Events: `GET /v1/events/<contract>/<signature>?decode=true`
  - Transactions: `GET /v1/transactions/<contract>`
  - Balances: `GET /v1/balances/<owner>/erc20`
  - Webhooks: push-based event notifications to your endpoints
  - Multichain: pass `?chain=8453&chain=84532` for cross-chain queries
  - Auth: `x-client-id` header with your thirdweb client ID
- **x402 v2:** `PAYMENT-SIGNATURE` / `PAYMENT-RESPONSE` headers (not v1's `X-PAYMENT`)
- **RPC Edge:** `https://<chainId>.rpc.thirdweb.com/<clientId>` — use as primary RPC for all chain reads
- **Dashboard:** import any contract by address, get auto-generated code snippets

### Alchemy Pro
- **RPC:** Use as secondary/fallback RPC provider for Base mainnet and Base Sepolia
- **Enhanced APIs:** `alchemy_getTokenBalances`, `alchemy_getAssetTransfers` — use for cross-referencing if Insight data needs verification
- **Webhooks:** Alchemy Notify as backup event notification system

### Tenderly Pro
- **Mainnet Forks:** Use for ALL testing that requires real mainnet state. Forks persist, have stable RPC URLs, and support `evm_increaseTime` + `evm_mine` for time manipulation
- **Transaction Simulations:** Use `tenderly_simulateTransaction` to dry-run contract calls before submitting real transactions
- **Monitoring & Alerting:** Set up Tenderly Alerts on contract events as a third monitoring layer
- **Debugger:** Use Tenderly's transaction debugger for any failed transaction investigation

---

## Clanker Token — The Real Token

**Do not write a MockERC20. Use the real Clanker-deployed token.**

### Clanker Has a Full Base Sepolia Deployment

Clanker v4.0.0 and v4.1.0 are deployed on Base Sepolia (chain 84532). The contracts are:

| Contract | Address (Base Sepolia) |
|----------|----------------------|
| Clanker (v4.0.0) | `0xE85A59c628F7d27878ACeB4bf3b35733630083a9` |
| ClankerFeeLocker | `0x42A95190B4088C88Dd904d930c79deC1158bF09D` |
| ClankerVault | `0xcC80d1226F899a78fC2E459a1500A13C373CE0A5` |
| ClankerAirdrop | `0x29d17C1A8D851d7d4cA97FAe97AcAdb398D9cCE0` |

### ClankerToken Contract Has ERC20Permit Built In

The ClankerToken contract (the token template Clanker deploys) inherits:
```solidity
contract ClankerToken is ERC20, ERC20Permit, ERC20Votes, ERC20Burnable, IERC7802
```

This means every Clanker-deployed token already has:
- `permit()` — EIP-2612 gasless approvals (required for x402)
- `burn()` / `burnFrom()` — ERC20Burnable
- `delegate()` / `getVotes()` — ERC20Votes
- IERC7802 — Superchain interop

**This is the token we test against.**

### Testing Strategy

**Option A — Base Sepolia (live testnet):**
Deploy a test Pulse token via Clanker's Sepolia deployer. This gives you a real ClankerToken with permit, burn, votes.

**Option B — Tenderly Mainnet Fork (for time manipulation tests):**
Fork Base mainnet at the current block via Tenderly. Use `evm_increaseTime` and `evm_mine` for streak building and TTL expiry tests.

**For Foundry tests:** Deploy the real ClankerToken contract (with ERC20Permit, ERC20Burnable, etc.) instead of MockERC20.

---

## Replacing In-Memory Store with Real Infrastructure

### Event Scanning: Thirdweb Insight (Not getLogs, Not Files)

Use thirdweb Insight API for all historical event data:

```typescript
const response = await fetch(
  `https://84532.insight.thirdweb.com/v1/events/${REGISTRY_ADDRESS}/Pulse(address,uint256,uint256)?decode=true&sort_by=block_number&sort_order=desc&limit=50`,
  { headers: { 'x-client-id': process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID } }
);
```

### Real-Time Updates: Thirdweb Insight Webhooks

Flow: `Pulse event on-chain` → `Insight webhook` → `POST /api/internal/pulse-webhook` → `Update Vercel KV` → `Edge Function reads KV`

### Hot State: Vercel KV (Not Files, Not In-Memory)

KV TTL must be shorter than protocol TTL. Cache miss triggers on-chain read via thirdweb SDK.

### On-Chain Reads: Thirdweb SDK (Not Raw Ethers/Viem)

```typescript
import { createThirdwebClient, getContract, readContract } from "thirdweb";
import { baseSepolia } from "thirdweb/chains";

const client = createThirdwebClient({ clientId: process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID });
const registry = getContract({ client, chain: baseSepolia, address: REGISTRY_ADDRESS });

const isAlive = await readContract({ contract: registry, method: "function isAlive(address) view returns (bool)", params: [agentAddress] });
```

---

## Banned Patterns

| Pattern | Why It's Banned | Use Instead |
|---------|----------------|-------------|
| `MockERC20` | Doesn't test permit, burn, SafeERC20 | Real ClankerToken contract |
| `new Map()` for state | Dies on cold start | Vercel KV |
| `fs.writeFileSync` for state | Vercel has read-only filesystem | Vercel KV |
| `fs.readFileSync` for events | Static recording, not verification | thirdweb Insight API |
| `provider.getLogs()` | Unindexed, slow, no pagination | thirdweb Insight API |
| `console.log` as a test assertion | Proves nothing | `assertEq`, `vm.expectRevert` |
| "Skipped — requires time manipulation" | That's what forks are for | `vm.warp` or `evm_increaseTime` |
| Raw `ethers.JsonRpcProvider` | No failover, no caching | thirdweb SDK `readContract` |
| JSON file as database | No concurrency, no persistence | Vercel KV |
| In-memory cache with TTL | Dies on cold start | Vercel KV with TTL |

---

## Definition of Done

1. `grep -r "Mock" test/` returns zero results
2. `grep -r "fs.writeFileSync\|fs.readFileSync" src/` returns zero results
3. `grep -r "new Map()" src/lib/` returns zero results for state storage
4. All 69+ Foundry tests pass with real ClankerToken implementation
5. Streak building and TTL expiry tests exist and pass (not skipped)
6. Vercel KV is the only cache layer, with TTL < protocol TTL
7. thirdweb Insight is the only event source for historical data
8. Edge Functions serve liveness data with KV → chain fallback
9. Contract ownership is in a Safe multisig
10. `BATTLE_TESTED.md` maps all claims to specific test names with real token, real time manipulation, real infrastructure
