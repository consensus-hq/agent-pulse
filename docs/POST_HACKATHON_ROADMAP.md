# Post-Hackathon Roadmap

## Priority 1: The Graph Integration (Reputation System)

**Status:** Architecture is Graph-ready. No structural rewrites needed.

### Why The Graph

The composite reputation endpoint (`/api/v2/agent/{addr}/reputation`) currently uses mocked data for:
- **Percentile ranking** (hardcoded 85.4) — needs aggregate data across all agents
- **30-day history** — currently synthetic noise around current score

The Graph provides both via a single subgraph indexing attestation + pulse events.

### Integration Plan

**What stays the same:**
- Composite formula (`f = 0.5 + 0.5 × r × (1 - e^(-v/τ))`) stays in API layer
- Response schema unchanged — frontend/SDK clients unaffected
- `/api/v2/agent/{addr}/reputation` endpoint remains the integration seam
- `useErc8004` hook continues for ERC-8004 identity/reputation reads

**What changes:**
- Replace mocked percentile with subgraph aggregate query
- Replace synthetic history with real indexed attestation events by time range
- Replace hardcoded data sources in the reputation endpoint with subgraph client

**Chainlink integration (optional):**
- Chainlink Functions can compute percentile off-chain and post on-chain
- Useful if on-chain reputation score is needed (e.g., for smart contract gating)

### Event Signatures (verified Graph-compatible)

PeerAttestation.sol events have full granularity for subgraph indexing:
```solidity
event AttestationSubmitted(
    address indexed attestor,   // ✅ indexed — filterable
    address indexed subject,    // ✅ indexed — filterable
    bool positive,              // ✅ positive/negative signal
    uint256 weight,             // ✅ attestation weight
    uint256 timestamp           // ✅ time-series queries
);

event EpochReset(address indexed attestor, uint256 newEpochStart);
```

**No contract redeploy needed** — event signatures are complete.

### ERC-8004 External Registries

ERC-8004 contracts are external (not ours). If they emit standard events, the subgraph can index them too. If not, direct reads via `useErc8004` hook continue to work — no conflict.

### Architecture Summary

```
Contracts (store) → The Graph (index) → API (compute) → Frontend (display)
                     ↑ NEW                ↑ formula stays    ↑ unchanged
                     replaces mocks       same endpoint      same schema
```

**Bottom line:** API computes, contracts store, frontend displays. The Graph slots into "where does the API get its raw data" — which is exactly what's mocked right now. No lock-in, no rewrites.

### Deployed Contract Addresses (Base Mainnet)

| Contract | Address |
|----------|---------|
| PULSE Token (Clanker V4) | `0x21111B39A502335aC7e45c4574Dd083A69258b07` |
| PulseRegistryV2 | `0xe61C615743A02983A46aFF66Db035297e8a43846` |
| PeerAttestation | `0x930dC6130b20775E01414a5923e7C66b62FF8d6C` |
| BurnWithFee | `0xd38cC332ca9755DE536841f2A248f4585Fb08C1E` |
| Treasury Safe | `0xA7940a42c30A7F492Ed578F3aC728c2929103E43` |
