# Agent Pulse — Smart Contract Security Audit

**Date:** 2026-02-05
**Auditor:** Senior Blockchain Security Review (Claude Opus 4.5)
**Commit:** `19b51ba7afb573f6202df851ea2c28e88985af0f`
**Framework:** Foundry (forge-std v1.7.6)
**Readiness:** **Caution — Ready with Fixes**

---

## 1. Executive Summary

Agent Pulse is a lightweight on-chain liveness registry for autonomous agents on Base. Agents burn 1 PULSE token per signal to remain "alive" (routable) within a configurable TTL window. The on-chain surface is small — a single 141-line contract (`PulseRegistry.sol`) with no upgradeability, no proxy, and no funds custody.

**Overall risk posture: Low-Medium.** The contract is well-structured, uses battle-tested OpenZeppelin v5.0.2 primitives, and avoids common pitfalls (reentrancy, unbounded loops, unchecked external calls). However, there are several findings that should be addressed before mainnet deployment:

- **1 Medium** — Streak counter overflow in `unchecked` block can silently wrap to zero after ~11.7 million consecutive days (theoretical, but violates invariants).
- **1 Medium** — Fee-on-transfer / deflationary token assumption: the contract does not verify actual received amounts, which breaks accounting if a non-standard PULSE token is used.
- **2 Low** — Owner centralization risks (single EOA), missing event emissions for `Transfer` verification hints.
- **3 Informational** — Gas optimizations, style, and test coverage gaps.

No critical vulnerabilities were found. No funds can be permanently lost through the contract itself (tokens flow directly to the immutable `signalSink`). The main risks are operational (owner key compromise, token misconfiguration) rather than smart-contract-level exploits.

---

## 2. System Overview

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      Agent (EOA/Contract)                │
│  1. approve(PulseRegistry, amount)                      │
│  2. pulse(amount)                                        │
└──────────────┬──────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────┐     safeTransferFrom
│       PulseRegistry          │ ──────────────────────►  signalSink (0x...dEaD)
│  ┌─────────────────────┐     │                          (immutable burn address)
│  │ AgentStatus          │     │
│  │  - lastPulseAt (u64) │     │
│  │  - streak (u32)      │     │     ERC20 token
│  │  - lastStreakDay (u32)│     │ ◄────────────────────  PULSE Token (immutable)
│  │  - hazardScore (u8)  │     │
│  └─────────────────────┘     │
│                              │
│  Admin (Owner):              │
│  - updateHazard(agent, score)│
│  - setTTL(newTTL)            │
│  - setMinPulseAmount(newMin) │
│  - pause() / unpause()       │
└──────────────────────────────┘

        ┌──────────────────┐
        │   Off-chain API   │
        │  (Next.js/Vercel) │
        │                   │
        │ /api/status/[addr]│ ── reads getAgentStatus()
        │ /api/pulse-feed   │ ── reads Pulse events
        │ /api/inbox-key    │ ── gates on isAlive()
        │ /api/inbox/[wallet│ ── uses in-memory key store
        └──────────────────┘
```

### Contract Responsibilities

| Contract | File | Lines | Purpose |
|---|---|---|---|
| `PulseRegistry` | `packages/contracts/contracts/PulseRegistry.sol` | 141 | Core liveness registry: pulse, streak tracking, TTL-based alive check, admin hazard scoring |
| `MockERC20` | `packages/contracts/test/mocks/MockERC20.sol` | 46 | Test-only minimal ERC20 (not deployed) |
| `MockReputationRegistry` | `packages/contracts/test/mocks/MockReputationRegistry.sol` | 18 | Test-only stub (not deployed) |

### Call Flows

1. **Pulse flow:** Agent calls `pulse(amount)` → contract validates `amount >= minPulseAmount` → `safeTransferFrom(agent, signalSink, amount)` → update streak → emit `Pulse` event.
2. **Alive check:** Anyone calls `isAlive(agent)` → returns `true` if `block.timestamp <= lastPulseAt + ttlSeconds`.
3. **Admin flow:** Owner calls `updateHazard`, `setTTL`, `setMinPulseAmount`, `pause`/`unpause`.

---

## 3. Attack Surface

### External Entry Points

| Function | Visibility | Caller | Guarded By |
|---|---|---|---|
| `pulse(uint256)` | external | Any EOA/contract | `whenNotPaused`, `nonReentrant` |
| `isAlive(address)` | external view | Anyone | None (read-only) |
| `getAgentStatus(address)` | external view | Anyone | None (read-only) |
| `updateHazard(address, uint8)` | external | Owner only | `onlyOwner` |
| `setTTL(uint256)` | external | Owner only | `onlyOwner` |
| `setMinPulseAmount(uint256)` | external | Owner only | `onlyOwner` |
| `pause()` | external | Owner only | `onlyOwner` |
| `unpause()` | external | Owner only | `onlyOwner` |

### Privileged Operations

| Operation | Controller | Risk |
|---|---|---|
| Set TTL | Owner (EOA) | Can set extremely high/low TTL to make all agents alive/dead |
| Set min pulse | Owner (EOA) | Can set prohibitively high minimum to DOS pulsing |
| Update hazard score | Owner (EOA) | Can arbitrarily flag/unflag agents |
| Pause/unpause | Owner (EOA) | Can permanently halt pulsing |

### Upgrade Surface

**None.** The contract is not upgradeable. No proxy pattern is used. `pulseToken` and `signalSink` are `immutable`. This is a positive security property — no upgrade foot-guns exist.

### Token Assumptions

- The contract assumes PULSE is a **standard ERC20** that returns `true` on `transferFrom` or reverts.
- `SafeERC20` is used, which handles non-standard return values (tokens that return nothing).
- The contract does **not** handle fee-on-transfer or rebasing tokens (see Finding M-02).
- The contract does **not** validate decimals — it works with raw `uint256` amounts.

### Out of Scope for an Attacker

- Cannot drain funds — tokens go directly to immutable `signalSink` (0x...dEaD burn address). The contract holds no token balance.
- Cannot manipulate other agents' streaks — each agent's state is keyed by `msg.sender`.
- Cannot forge pulse events — the `Pulse` event is emitted only within the `pulse()` function which requires a successful token transfer.

---

## 4. Findings Table

| ID | Title | Severity | Likelihood | Impact | File/Contract | Status |
|---|---|---|---|---|---|---|
| M-01 | Streak counter overflow in `unchecked` block | Medium | Very Low | Medium | `PulseRegistry.sol:86` | Open |
| M-02 | Fee-on-transfer token compatibility not validated | Medium | Low | Medium | `PulseRegistry.sol:75` | Open |
| L-01 | Owner is a single EOA — no multisig or timelock | Low | Medium | High | `PulseRegistry.sol:59` | Open |
| L-02 | No upper bound on `ttlSeconds` or `minPulseAmount` | Low | Low | Medium | `PulseRegistry.sol:122-131` | Open |
| I-01 | Missing `Transfer` event verification note in documentation | Informational | — | — | `PulseRegistry.sol:75` | Open |
| I-02 | Test coverage gaps: no fuzz tests, no edge-case boundary tests | Informational | — | — | `test/PulseRegistry.t.sol` | Open |
| I-03 | `MockERC20` does not emit ERC20 `Transfer`/`Approval` events | Informational | — | — | `test/mocks/MockERC20.sol` | Open |

---

## 5. Detailed Findings

### M-01 — Streak Counter Overflow in `unchecked` Block

**Severity:** Medium
**Likelihood:** Very Low (requires ~11.7 million consecutive daily pulses = ~32,000 years)
**Impact:** Medium (streak silently wraps to 0, corrupting agent reputation data)

**Root Cause:**
`PulseRegistry.sol:86`:
```solidity
unchecked { s.streak += 1; }
```
The `streak` field is a `uint32` (max value `4,294,967,295`). The `unchecked` block disables overflow checking. If `streak` reaches `type(uint32).max` and increments, it wraps to `0` without reverting.

**Exploit Scenario:**
1. An agent pulses every day for 4,294,967,295+ consecutive days (~11.7 million years).
2. On the next day, `streak` overflows to `0`.
3. Any off-chain system relying on `streak` for reputation/ranking would see the agent's streak as `0` despite continuous activity.

**Impact:**
While practically unreachable in human timescales, this violates the invariant that "streak always increases by 1 for consecutive-day pulses." In a formally correct system, this should not be possible.

**Recommendation:**
Add a saturation check instead of using `unchecked`:
```solidity
if (s.streak < type(uint32).max) {
    s.streak += 1;
}
// else: streak is capped at max, no overflow
```
Or simply remove `unchecked` and let Solidity 0.8.x revert on overflow (the gas savings are negligible for a single `uint32` increment — ~3 gas).

**Suggested Test:**
```solidity
function testStreakOverflowSaturation() public {
    // Set streak to max via storage manipulation
    vm.store(address(registry), ...); // set streak to type(uint32).max
    vm.warp(block.timestamp + 1 days);
    vm.prank(alice);
    registry.pulse(minPulse);
    (, uint32 streak,,) = registry.agents(alice);
    assertEq(streak, type(uint32).max); // should not wrap
}
```

---

### M-02 — Fee-on-Transfer Token Compatibility Not Validated

**Severity:** Medium
**Likelihood:** Low (depends on the PULSE token implementation — currently TBD)
**Impact:** Medium (accounting mismatch: emitted event shows `amount` but sink receives `amount - fee`)

**Root Cause:**
`PulseRegistry.sol:75`:
```solidity
pulseToken.safeTransferFrom(msg.sender, signalSink, amount);
```
The contract transfers `amount` tokens to the sink and emits `Pulse(agent, amount, ...)`. If the PULSE token charges a transfer fee (fee-on-transfer), the actual amount reaching the sink is less than `amount`, but the event and all on-chain state record the full `amount`.

**Exploit Scenario:**
1. PULSE token is deployed with a 1% transfer fee.
2. Agent calls `pulse(1e18)`.
3. Only `0.99e18` arrives at the sink, but the `Pulse` event says `1e18`.
4. Off-chain indexers (pulse-feed API, alive checks) record inflated amounts.

**Impact:**
Accounting discrepancy between emitted events and actual token flows. If the protocol ever needs to reconcile burn totals, they won't match. Indexers display incorrect burn amounts.

**Recommendation:**
If the PULSE token is guaranteed to be a standard, no-fee ERC20 (e.g., Clanker-deployed), document this assumption explicitly in the contract NatSpec and deployment runbook. If fee-on-transfer must be supported:
```solidity
uint256 balanceBefore = pulseToken.balanceOf(signalSink);
pulseToken.safeTransferFrom(msg.sender, signalSink, amount);
uint256 actualAmount = pulseToken.balanceOf(signalSink) - balanceBefore;
emit Pulse(msg.sender, actualAmount, block.timestamp, s.streak);
```

**Suggested Test:**
```solidity
// Deploy a fee-on-transfer mock and verify accounting
function testFeeOnTransferAccounting() public {
    FeeOnTransferToken feeToken = new FeeOnTransferToken(1); // 1% fee
    PulseRegistry reg = new PulseRegistry(address(feeToken), sink, ttl, minPulse);
    // pulse and assert event amount matches actual sink delta
}
```

---

### L-01 — Owner Is a Single EOA — No Multisig or Timelock

**Severity:** Low
**Likelihood:** Medium (key compromise is a real-world risk)
**Impact:** High (complete control over TTL, hazard scores, pause; can soft-DOS the protocol)

**Root Cause:**
`PulseRegistry.sol:59`:
```solidity
) Ownable(msg.sender) {
```
The deployer becomes the sole owner. The deployment script (`scripts/deploy-registry.ts`) deploys from a single private key loaded from `DEPLOYER_PRIVATE_KEY` env var. There is no ownership transfer to a multisig, no timelock, and no two-step ownership transfer pattern.

**Exploit Scenario:**
1. Deployer private key is compromised.
2. Attacker calls `pause()` to halt all pulsing — all agents become stale after TTL expires.
3. Attacker calls `setMinPulseAmount(type(uint256).max)` to permanently block pulses even after unpause.
4. Attacker calls `updateHazard(victim, 100)` to maliciously flag agents.

**Impact:**
Full protocol disruption. No funds at risk (no custody), but liveness and reputation semantics are compromised.

**Recommendation:**
- Transfer ownership to a Gnosis Safe multisig (the Treasury Safe at `0xA794...3E43` already exists).
- Use OpenZeppelin's `Ownable2Step` instead of `Ownable` for safer ownership transfers.
- Consider adding a timelock for `setTTL` and `setMinPulseAmount` to give agents notice.

**Suggested Test:**
```solidity
function testOwnershipTransferToMultisig() public {
    registry.transferOwnership(address(multisig));
    assertEq(registry.owner(), address(multisig));
}
```

---

### L-02 — No Upper Bound on `ttlSeconds` or `minPulseAmount`

**Severity:** Low
**Likelihood:** Low (requires malicious or misconfigured owner)
**Impact:** Medium (can make all agents permanently alive or permanently dead)

**Root Cause:**
`PulseRegistry.sol:122-131`:
```solidity
function setTTL(uint256 newTTL) external onlyOwner {
    if (newTTL == 0) revert InvalidTTL();
    ttlSeconds = newTTL;
    // ...
}

function setMinPulseAmount(uint256 newMin) external onlyOwner {
    if (newMin == 0) revert InvalidMinPulseAmount();
    minPulseAmount = newMin;
    // ...
}
```
Both functions only check for zero. There are no upper bounds.

**Exploit Scenario:**
- `setTTL(type(uint256).max)` → every agent that ever pulsed is "alive" forever, defeating the liveness mechanism.
- `setTTL(1)` → agents must pulse every second to stay alive, which is economically and practically infeasible.
- `setMinPulseAmount(type(uint256).max)` → nobody can pulse; protocol is dead.

**Recommendation:**
Add reasonable bounds:
```solidity
uint256 public constant MAX_TTL = 30 days;
uint256 public constant MIN_TTL = 1 hours;
uint256 public constant MAX_MIN_PULSE = 1000e18;

function setTTL(uint256 newTTL) external onlyOwner {
    if (newTTL < MIN_TTL || newTTL > MAX_TTL) revert InvalidTTL();
    ttlSeconds = newTTL;
    emit TTLUpdated(newTTL);
}
```

---

### I-01 — Missing Transfer Verification Documentation

**Severity:** Informational

**Root Cause:**
The contract uses `safeTransferFrom` which handles non-reverting tokens, but the NatSpec does not document the assumption that PULSE is a standard ERC20. The Clanker-deployed token may or may not have standard behavior — this is not verified anywhere in the deployment scripts.

**Recommendation:**
Add a NatSpec comment to the constructor or contract header:
```solidity
/// @dev pulseToken MUST be a standard ERC20 (no fee-on-transfer, no rebasing).
///      SafeERC20 handles tokens that return false or nothing on transfer.
```

---

### I-02 — Test Coverage Gaps

**Severity:** Informational

The test suite (`PulseRegistry.t.sol`, 134 lines, 8 tests) covers basic functionality but is missing:

| Category | Missing Test |
|---|---|
| Fuzz testing | No fuzz tests for `pulse(uint256 amount)` with random amounts |
| Boundary: TTL exact | Test `isAlive` at exactly `lastPulseAt + ttlSeconds` (boundary: should be `true`) |
| Boundary: TTL+1 | Already covered (pass) |
| Boundary: streak day rollover | Test pulse at exactly midnight UTC (`block.timestamp % 86400 == 0`) |
| Admin: setTTL | No test for `setTTL` success or access control |
| Admin: setMinPulseAmount | No test for `setMinPulseAmount` success or access control |
| Admin: non-owner revert | No test that non-owner calls to admin functions revert |
| Concurrent agents | No test with multiple agents pulsing |
| Zero-amount pulse | Covered implicitly by `minPulse - 1` test but not `amount = 0` |
| Contract caller | No test with a contract (not EOA) calling `pulse` |
| Reentrancy | No test verifying reentrancy protection (e.g., malicious token callback) |
| Pausable: unpause → pulse | No test that unpausing restores functionality |
| Event emission | No test verifying emitted event parameters match expectations |

**Recommendation:**
Add fuzz tests and boundary tests. Example:
```solidity
function testFuzz_pulse(uint256 amount) public {
    vm.assume(amount >= minPulse && amount <= 10e18);
    token.mint(alice, amount);
    vm.prank(alice);
    registry.pulse(amount);
    assertTrue(registry.isAlive(alice));
}
```

---

### I-03 — `MockERC20` Does Not Emit ERC20 Events

**Severity:** Informational

**Root Cause:**
`test/mocks/MockERC20.sol` does not emit `Transfer` or `Approval` events. While this is a test-only contract, the off-chain indexing logic (`alive.ts`, `pulseFeed.ts`) relies on `Transfer` events. Tests that validate event-based indexing would fail to catch regressions because the mock doesn't emit the expected events.

**Recommendation:**
Add standard ERC20 events to `MockERC20`:
```solidity
event Transfer(address indexed from, address indexed to, uint256 value);
event Approval(address indexed owner, address indexed spender, uint256 value);
```
And emit them in `_transfer`, `approve`, and `mint`.

---

## 6. Non-Issues / Confirmed Properties

| Property | Status | Reasoning |
|---|---|---|
| **Reentrancy safety** | Safe | `pulse()` uses `nonReentrant` modifier. The external call (`safeTransferFrom`) happens before state updates, but the guard prevents re-entry regardless. Even without the guard, the state update pattern (write after transfer) is safe because a re-entrant call would succeed and overwrite `lastPulseAt`/`streak` — no economic exploit is possible since tokens only flow outward to `signalSink`. |
| **Integer overflow (non-streak)** | Safe | Solidity 0.8.20 has built-in overflow checks. The `uint32(block.timestamp / SECONDS_PER_DAY)` cast is safe until year ~2378 (when `block.timestamp / 86400` exceeds `type(uint32).max`). The `uint64(block.timestamp)` cast is safe until year ~584 billion. |
| **`block.timestamp` manipulation** | Acceptable | Miners can manipulate timestamps by a few seconds, but this only affects the day boundary (edge case: pulse lands on day N vs N+1). The impact is a ±1 streak count at midnight, which is inconsequential for the protocol's liveness semantics. |
| **Front-running / MEV** | Not exploitable | There is no economic benefit to front-running a `pulse()` call. Pulsing is self-referential (only affects `msg.sender`'s state). There is no auction, swap, or price-dependent logic. |
| **Denial-of-service (gas griefing)** | Safe | `pulse()` has O(1) gas cost. No loops, no dynamic arrays. The `mapping` access and single `safeTransferFrom` are constant-gas operations. |
| **Storage packing** | Correct | `AgentStatus` struct: `uint64` (8 bytes) + `uint32` (4 bytes) + `uint32` (4 bytes) + `uint8` (1 byte) = 17 bytes, fitting in a single 32-byte storage slot. This is gas-efficient and correctly packed. |
| **Event correctness** | Correct | `Pulse` event indexes `agent` (correct for filtering). Includes `amount`, `timestamp`, `streak`. The `HazardUpdated`, `TTLUpdated`, and `MinPulseAmountUpdated` events are complete and correctly parameterized. |
| **Access control** | Correct | All admin functions use `onlyOwner`. `Ownable` from OZ v5.0.2 is well-audited. The `pulse()` function is correctly permissionless (any address can pulse for itself). |
| **Pausability** | Correct | Only `pulse()` is gated by `whenNotPaused`. View functions (`isAlive`, `getAgentStatus`) remain accessible during pause, which is correct — agents can still be queried. |
| **Immutable configuration** | Correct | `pulseToken` and `signalSink` are `immutable`, set in the constructor, and validated for zero-address. They cannot be changed post-deployment. |
| **No selfdestruct / delegatecall** | Safe | The contract does not use `selfdestruct` or `delegatecall`. It cannot be destroyed or have its logic replaced. |
| **No ETH handling** | Safe | The contract has no `receive()` or `fallback()` function. ETH sent to the contract is rejected. |

---

## 7. Gas & Efficiency Notes

| Observation | Impact | Note |
|---|---|---|
| Storage packing is optimal | Positive | `AgentStatus` fits in 1 slot (17/32 bytes used). Each `pulse()` writes 1 SSTORE (warm after first). |
| `unchecked` streak increment | ~3 gas saved | Negligible savings; removing `unchecked` is recommended for safety (see M-01). |
| `safeTransferFrom` overhead | ~200 gas vs raw `transferFrom` | Justified for safety with non-standard tokens. |
| No `indexed` on `amount`/`timestamp`/`streak` in `Pulse` event | Correct | These are value fields, not filter fields. Only `agent` needs indexing. |
| View functions use `memory` copy | Correct | `getAgentStatus` copies to memory, which is the standard pattern for view returns from mappings. |
| Multiple SSTORE in `pulse()` | Optimal | Since all fields are in one slot, the EVM writes the entire slot once. The compiler should batch these into a single SSTORE. |

---

## 8. Deployment & Ops Checklist

### Pre-Deployment

- [ ] **Confirm PULSE token is standard ERC20.** Verify no fee-on-transfer, no rebasing, no blocklist. If Clanker-deployed, review the Clanker factory's token template.
- [ ] **Verify constructor parameters:**
  - `_pulseToken`: Confirmed deployed PULSE token address on Base.
  - `_signalSink`: `0x000000000000000000000000000000000000dEaD` (dead address, non-recoverable).
  - `_ttlSeconds`: `86400` (24 hours).
  - `_minPulseAmount`: `1e18` (1 PULSE, assuming 18 decimals).
- [ ] **Deployer wallet security:** Use a hardware wallet or secure key management. Do not use a hot wallet private key in plaintext env vars in production.
- [ ] **Verify `signalSink` is truly a burn address.** `0x...dEaD` has no known private key, but confirm it has no code on Base (it should be an EOA with no bytecode).

### Post-Deployment

- [ ] **Transfer ownership** to the Treasury Safe multisig (`0xA7940a42c30A7F492Ed578F3aC728c2929103E43`) immediately after deployment.
- [ ] **Verify contract on BaseScan.** Use `forge verify-contract` with constructor args.
- [ ] **Update `LINKS.md`** with the deployed PulseRegistry address.
- [ ] **Update Vercel env vars** (`NEXT_PUBLIC_PULSE_REGISTRY_ADDRESS`).
- [ ] **Smoke test on mainnet:**
  1. Approve PULSE to PulseRegistry.
  2. Call `pulse(1e18)`.
  3. Verify `isAlive(deployer)` returns `true`.
  4. Verify `Pulse` event is emitted and indexed by the API.
  5. Wait for TTL expiry and verify `isAlive` returns `false`.

### Monitoring

- [ ] **Set up event monitoring** for `Pulse`, `HazardUpdated`, `TTLUpdated`, `MinPulseAmountUpdated` events.
- [ ] **Alert on admin actions** — any `setTTL`, `setMinPulseAmount`, `updateHazard`, `pause`, or `unpause` call should trigger an alert.
- [ ] **Monitor owner address** for unexpected transactions.
- [ ] **Monitor pause state** — if paused for more than N hours, alert.

### Key Management

- [ ] **Deployer key:** Should be a dedicated deployment key, not a day-to-day operational key. Discard or secure after ownership transfer.
- [ ] **Owner key (multisig):** Treasury Safe should have ≥2/3 signers. Signers should use hardware wallets.
- [ ] **No private keys in environment variables in production.** The `env.server.ts` file exposes `PRIVATE_KEY` — ensure this is never a mainnet key with funds.

### Pause & Recovery

- [ ] **Document pause procedure:** Under what conditions should the contract be paused? (e.g., token exploit, critical bug discovery).
- [ ] **Document unpause procedure:** Who approves? Multisig threshold?
- [ ] **No emergency withdrawal needed** — the contract holds no funds.

---

## 9. Appendix

### A. Scope Inventory

| File | Type | In Scope |
|---|---|---|
| `packages/contracts/contracts/PulseRegistry.sol` | Core contract | Yes |
| `packages/contracts/test/PulseRegistry.t.sol` | Test suite | Yes (coverage review) |
| `packages/contracts/test/mocks/MockERC20.sol` | Test mock | Yes (quality review) |
| `packages/contracts/test/mocks/MockReputationRegistry.sol` | Test mock | Yes (quality review) |
| `packages/contracts/foundry.toml` | Build config | Yes |
| `scripts/deploy-registry.ts` | Deployment script | Yes |
| `scripts/deploy-testnet.ts` | Deployment script | Yes |
| `scripts/fork-smoke.ts` | Smoke test | Yes |
| `scripts/agent-pulse-tenderly-sim.ts` | Simulation script | Yes |
| `scripts/start-base-fork.sh` | Fork script | Yes |
| `apps/web/src/app/api/status/[address]/route.ts` | Off-chain API | Yes (integration) |
| `apps/web/src/app/api/inbox-key/route.ts` | Off-chain API | Yes (integration) |
| `apps/web/src/app/api/inbox/[wallet]/route.ts` | Off-chain API | Yes (integration) |
| `apps/web/src/app/api/pulse-feed/route.ts` | Off-chain API | Yes (integration) |
| `apps/web/src/app/lib/alive.ts` | Off-chain lib | Yes (integration) |
| `apps/web/src/app/lib/inboxStore.ts` | Off-chain lib | Yes (integration) |
| `apps/web/src/app/lib/erc8004.ts` | Off-chain lib | Yes (integration) |
| `apps/web/src/app/lib/env.server.ts` | Env config | Yes (secrets review) |
| `apps/web/src/app/lib/env.public.ts` | Env config | Yes (exposure review) |

### B. Dependency Versions

| Dependency | Version | Pinned Hash | Notes |
|---|---|---|---|
| OpenZeppelin Contracts | v5.0.2 | `dbb6104ce834628e473d2173bbc9d47f81a9eec3` | Well-audited. No known vulnerabilities at this version for `Ownable`, `Pausable`, `ReentrancyGuard`, `SafeERC20`. |
| forge-std | v1.7.6 | `ae570fec082bfe1c1f45b0acca4a2b4f84d345ce` | Test framework only, not deployed. |
| Solidity compiler | ^0.8.20 | — | Compatible with OZ v5.0.2. Built-in overflow protection active. |

### C. Off-Chain Integration Security Notes

The following are not smart contract findings but are relevant to the system's security:

1. **`env.server.ts` exposes `PRIVATE_KEY`** (line 9). This should never be a funded mainnet key. If used for server-side signing, it should be a dedicated hot wallet with minimal balance, or replaced with a KMS signer.

2. **Inbox key store is in-memory** (`inboxStore.ts`). Keys are lost on server restart. This is acceptable for MVP but means:
   - Keys cannot be revoked across server instances.
   - A server restart effectively revokes all keys (denial of service for active agents).
   - No rate limiting on key issuance — an attacker who controls a funded wallet can spam `/api/inbox-key` to generate unlimited keys.

3. **`alive.ts` duplicates on-chain logic** using Transfer events instead of the `PulseRegistry` contract. This creates a consistency risk if the on-chain logic is updated (e.g., TTL changes via `setTTL`) but the off-chain alive window (`ALIVE_WINDOW_SECONDS`) is not updated in Vercel env vars.

4. **`pulse-feed/route.ts` recursive log chunking** has no depth limit. If RPC repeatedly errors, this could cause deep recursion (though in practice, Node.js will hit stack limits and the catch will return `[]`).

5. **No CORS or rate limiting** on API routes. In a Vercel deployment, these are partially mitigated by Vercel's edge infrastructure, but explicit rate limiting should be added for `/api/inbox-key` and `/api/inbox/[wallet]`.

### D. Agent-Specific Risk Assessment

Since this system is designed for autonomous AI agents, not human users:

| Risk | Assessment |
|---|---|
| **Automated calling patterns** | Agents will call `pulse()` periodically. The contract handles this correctly — same-day pulses are idempotent for streaks. No risk of double-counting. |
| **Repeated pulses (cost accumulation)** | Each pulse costs 1 PULSE (burned). An agent pulsing excessively wastes tokens. The `minPulseAmount` enforces a floor, but there is no ceiling. An agent can accidentally burn its entire balance by calling `pulse` in a loop. This is not a contract bug but an agent-side risk. |
| **Botched approvals** | If an agent approves less than `minPulseAmount`, `safeTransferFrom` reverts cleanly. The agent must handle this and re-approve. |
| **Key leakage** | Agent private keys are stored off-chain (not in the contract). If an agent's key is compromised, the attacker can pulse on behalf of the agent (burning the agent's tokens) or stop pulsing (letting the agent go stale). Neither results in fund theft from the contract. |
| **Silent reverts** | `pulse()` reverts with custom errors (`BelowMinimumPulse`, `InvalidHazardScore`, etc.) that include parameters. This is agent-friendly — errors are parseable. The `Pausable` revert uses OZ's `EnforcedPause()` custom error, which is also descriptive. |
| **Replay-like behavior** | Pulsing is idempotent within a day (streak unchanged). Cross-day, each pulse increments the streak. There is no replay risk — `lastPulseAt` is always updated to the current `block.timestamp`. |
| **Brittle indexing** | The `Pulse` event has all necessary fields. However, off-chain indexers (`alive.ts`) use `Transfer` events on the PULSE token rather than `Pulse` events from the registry. This is fragile — a direct transfer to `signalSink` that doesn't go through `pulse()` would be counted as a valid pulse by the off-chain system but not the on-chain registry. |

### E. Tooling Assumptions

- **Manual review only.** No automated static analysis (Slither, Mythril) or fuzz testing (Echidna/Medusa) was executed in this environment. These tools should be run in CI as an additional layer.
- **No formal verification** was performed.
- **Compiler version** assumed to be Solidity 0.8.20+ as specified in the pragma.

### F. Scope Exclusions

- PULSE token contract itself (not yet deployed; TBD via Clanker).
- ERC-8004 Identity Registry (`0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`) — third-party contract.
- ERC-8004 Reputation Registry (`0x8004BAa17C55a88189AE136b182e5fdA19dE9b63`) — third-party contract.
- Clanker SDK and factory contracts.
- Gnosis Safe (Treasury) contract.
- Uniswap V4 pool contracts.
- Base L1/L2 bridge security.
- Frontend React components (non-security-relevant UI).

---

*End of audit report.*
