# Rename Manifest & Spec Compliance Report

## 1. PulseRegistry
**Spec Source:** `CONTRACT_SPEC.md`
**Status:** COMPLIANT WITH DEVIATIONS

| Item | Spec | Actual | Status | Note |
|------|------|--------|--------|------|
| Inheritance | Ownable | Ownable2Step | **DEVIATION** | Security improvement (Audit L-03) |
| Inheritance | Pausable, ReentrancyGuard | Same | MATCH | |
| Function | `pulse(uint256)` | Same | MATCH | |
| Function | `isAlive(address)` | Same | MATCH | |
| Function | `getAgentStatus(address)` | Same | MATCH | |
| Function | `updateHazard(address,uint8)` | Same | MATCH | |
| Function | `setTTL(uint256)` | Same | MATCH | Added MAX_TTL check (Audit M-02) |
| Function | `setMinPulseAmount(uint256)` | Same | MATCH | Added MAX_MIN_PULSE check (Audit M-02) |
| Event | `Pulse(...)` | Same | MATCH | |
| Error | `BelowMinimumPulse` | Same | MATCH | |

## 2. PulseRegistryV2
**Spec Source:** Implied V2 Feature (No entry in `CONTRACT_SPEC.md`)
**Status:** NEW FEATURE

- Implements `IPulseRegistryV2`, `IAgentVerifiable`
- Adds Reliability Scoring (Streak + Volume + Stake)
- Adds Staking (`stake`, `unstake`)
- Adds Tier logic (`getAgentTier`)
- **Action:** Retained as is.

## 3. PeerAttestation
**Spec Source:** Implied V2 Feature (No entry in `CONTRACT_SPEC.md`)
**Status:** NEW FEATURE

- Implements Peer-to-Peer attestation
- Sybil protection: Max 10 attestations/epoch, 1 per pair/epoch
- **Action:** Retained as is.

## 4. BurnWithFee
**Spec Source:** Implied V2 Feature (No entry in `CONTRACT_SPEC.md`)
**Status:** NEW FEATURE

- Wrapper for Pulse burning with fee split
- Fee parameter: defaults 1% (100 bps)
- **Action:** Retained as is.

## 5. Summary of Changes
1.  **Fixed Compilation:** Updated import paths in all `test/*.t.sol` files from `../src/` to `../contracts/`.
2.  **Fixed Tests:** Removed `view` modifier from test functions that modify state (Forge requirement).
3.  **Verification:** All tests passed (202 tests).
