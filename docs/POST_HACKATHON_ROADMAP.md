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

### Deployed Contract Addresses (Sepolia)

| Contract | Address |
|----------|---------|
| PeerAttestation | `0x4B14c36e86fC534E401481Bc1834f0762788aaf5` |
| BurnWithFee | `0x326a15247C958E94de93C8E471acA3eC868f58ec` |
| PulseToken | `0x7f24C286872c9594499CD634c7Cc7735551242a2` |
| PulseRegistry | `0x2C802988c16Fae08bf04656fe93aDFA9a5bA8612` |
