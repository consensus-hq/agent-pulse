# Agent Pulse — Example Wrapper Contracts

Three composable contracts that demonstrate how to build on Agent Pulse primitives. Each contract reads on-chain liveness and reputation data from the core protocol without holding or managing PULSE tokens itself (except where staking is the point).

## Deployed Addresses (Base Mainnet)

| Contract | Address |
|---|---|
| PulseRegistry | `0xe61C615743A02983A46aFF66Db035297e8a43846` |
| PeerAttestation | `0x930dC6130b20775E01414a5923e7C66b62FF8d6C` |
| PulseToken | `0x21111B39A502335aC7e45c4574Dd083A69258b07` |

## Shared Interfaces

Both `IPulseRegistry.sol` and `IPeerAttestation.sol` are minimal read-only interfaces that extract only the view functions needed by downstream contracts. Import them from this directory.

---

## 1. LivenessGatedVault

**File:** `LivenessGatedVault.sol`

**Pattern:** Liveness as Access Control

An ERC-4626 tokenised vault where only agents with a pulse streak ≥ `minStreak` can deposit or withdraw. The vault wraps any ERC-20 (e.g. PULSE) and issues share tokens in return.

### How It Works

1. On every `deposit()`, `mint()`, `withdraw()`, or `redeem()`, the contract calls `PulseRegistry.getAgentStatus(msg.sender)`.
2. If the agent's `streak` is below the configured minimum, or if `isAlive` is false, the transaction reverts.
3. Share accounting is handled entirely by OpenZeppelin's ERC-4626 implementation.

### Integration Points

```solidity
IPulseRegistry.getAgentStatus(agent)
  → (bool alive, uint256 lastPulseAt, uint256 streak, uint256 hazardScore)
```

### Use Cases

- Agent-only yield vaults (only reliable agents can participate)
- Gated liquidity pools
- Trust-tiered access to DeFi protocols

---

## 2. DeadAgentInsurance

**File:** `DeadAgentInsurance.sol`

**Pattern:** Reading PulseRegistry Timestamps

A peer-to-peer insurance pool where users stake PULSE against agent downtime. If an insured agent misses a configurable number of consecutive TTL windows (e.g. 3 × 24h = 72h of silence), stakers can claim the pool.

### How It Works

1. Anyone creates a pool for a specific agent via `createPool(agent)`.
2. Stakers deposit PULSE into the pool via `stake(poolId, amount)`.
3. Stakers can `unstake()` at any time while the pool is active.
4. Anyone can call `declareAgentDead(poolId)` — this reads `lastPulseAt` and `ttlSeconds` from PulseRegistry to compute missed windows.
5. If `missedWindows ≥ threshold`, the pool transitions to `Claimable`.
6. Stakers call `claim(poolId)` to withdraw their proportional share.

### Integration Points

```solidity
IPulseRegistry.getAgentStatus(agent)
  → (bool alive, uint256 lastPulseAt, uint256 streak, uint256 hazardScore)

IPulseRegistry.ttlSeconds()
  → uint256 (default 86400)

// Missed windows formula:
missedWindows = (block.timestamp - lastPulseAt) / ttlSeconds
```

### Use Cases

- SLA guarantees for agent-to-agent service agreements
- Downtime hedging for agent operators
- Decentralised dead-man's-switch triggers

---

## 3. ReputationWeightedVote

**File:** `ReputationWeightedVote.sol`

**Pattern:** PulseRegistry × PeerAttestation Composability

Governance voting where each agent's vote weight is computed from two on-chain signals:

```
weight = streak × max(netAttestationScore, 0)
```

An agent with streak=10 and netScore=5 has weight 50. An agent with a negative net score cannot vote.

### How It Works

1. An alive agent creates a proposal with `createProposal(descriptionHash, durationSeconds)`.
2. Agents vote FOR or AGAINST via `vote(proposalId, support)`.
3. At vote time, the contract reads streak from PulseRegistry and net attestation score from PeerAttestation.
4. Weight is computed as `streak × max(netScore, 0)` — untrusted agents get zero weight.
5. Results are queryable via `getResult(proposalId)`.

### Integration Points

```solidity
IPulseRegistry.getAgentStatus(agent)
  → (bool alive, uint256 lastPulseAt, uint256 streak, uint256 hazardScore)

IPeerAttestation.getNetAttestationScore(agent)
  → int256 netScore
```

### Use Cases

- Sybil-resistant agent governance (streak prevents Sybil; attestations prevent collusion)
- Multi-agent consensus mechanisms
- Weighted signalling for protocol parameter changes

---

## Building

From the repo root:

```bash
cd packages/contracts
forge build
```

These are example contracts and are not deployed. They demonstrate integration patterns for developers building on Agent Pulse.

## Security Notes

- These contracts are **unaudited examples** — do not deploy to production as-is.
- All state-changing functions follow the CEI (Checks-Effects-Interactions) pattern.
- ReentrancyGuard is applied to all functions that transfer tokens.
- `minStreak` in LivenessGatedVault is immutable to prevent governance manipulation.
- DeadAgentInsurance pools are permissionless — anyone can create one and anyone can trigger `declareAgentDead`.
