# Pulse of Life Protocol — Verification Plan

**Version:** 1.0  
**Date:** 2026-02-05  
**Owner:** Agent 1 (Strategic Lead)  
**Status:** DRAFT — Pending swarm execution  

---

## 1. Protocol Verification Plan Overview

### 1.1 Purpose

This document defines the complete verification sequence for the PulseRegistry smart contract across three environments:
- **Local Fork** (anvil/Base mainnet fork)
- **Public Testnet** (Base Sepolia)
- **Mainnet** (Base — final validation only)

### 1.2 Contract Under Test

| Component | Address/Location | Notes |
|-----------|------------------|-------|
| PulseRegistry | TBD (deployment output) | Core protocol contract |
| PulseToken | TBD (deployment output) | ERC-20 utility token |
| Signal Sink | `0x000000000000000000000000000000000000dEaD` | Fixed burn address (immutable) |
| Safe (Treasury) | `0xA7940a42c30A7F492Ed578F3aC728c2929103E43` | From LINKS.md |

### 1.3 Wallet Assignments

| Wallet | Role | Actions Authorized |
|--------|------|-------------------|
| `DEPLOYER` | Protocol Owner | Deploy, setTTL, setMinPulseAmount, updateHazard, pause, unpause, transferOwnership |
| `ALICE` | Test Agent 1 | pulse(), view functions |
| `BOB` | Test Agent 2 | pulse(), view functions |
| `CHARLIE` | Test Agent 3 | pulse(), stress test participant |
| `ATTACKER` | Antagonist | Attempt reverts, edge cases |

---

## 2. Sequenced Protocol Verification Plan

### Phase 0: Pre-Flight Checks

| Step | Action | Caller | Expected Result | Viz Display | Failure Mode |
|------|--------|--------|-----------------|-------------|--------------|
| 0.1 | Verify DEPLOYER balance | System | > 0.001 ETH (fork) OR > 0.1 ETH (testnet) | Wallet balance widget | `INSUFFICIENT_FUNDS` — abort sequence |
| 0.2 | Verify RPC connectivity | System | Block number > 0, < 30s latency | Network status green | `ETIMEDOUT` — retry with backup RPC |
| 0.3 | Verify token faucet (testnet only) | System | Can request > 100 PULSE | Faucet status | `FAUCET_DRY` — use alternative faucet |
| 0.4 | Load contract ABIs | System | All 4 contracts parsed | ABI loaded indicator | `ABI_PARSE_FAILURE` — fix paths |

---

### Phase 1: Contract Deployment

| Step | Function Call | Caller | Expected Result | Viz Display | Failure Mode |
|------|--------------|--------|-----------------|-------------|--------------|
| 1.1 | `new PulseToken("Pulse", "PULSE", 1000000e18, DEPLOYER)` | DEPLOYER | Token deployed, 1M supply minted | Token address, supply | `CREATE2_COLLISION` — use fresh nonce |
| 1.2 | `PulseToken.approve(REGISTRY, max)` | DEPLOYER | Approval confirmed | Approval tx hash | `APPROVE_FAIL` — token problem |
| 1.3 | `new PulseRegistry(TOKEN, 0x...dEaD, 86400, 1e18)` | DEPLOYER | Registry deployed with params | Registry address, config | `InvalidTTL`, `InvalidMinPulseAmount` — params out of bounds |
| 1.4 | Verify `pulseToken()` | System | Yields TOKEN address | Config panel | `WRONG_TOKEN` — constructor problem |
| 1.5 | Verify `signalSink()` | System | Yields `0x...dEaD` | Config panel | `SINK_MUTABLE` — critical flaw |
| 1.6 | Verify `ttlSeconds()` | System | Yields `86400` | Config panel | `WRONG_TTL` — config problem |
| 1.7 | Verify `minPulseAmount()` | System | Yields `1e18` | Config panel | `WRONG_MIN` — config problem |
| 1.8 | Distribute tokens: `PulseToken.transfer(ALICE, 100e18)` | DEPLOYER | ALICE balance = 100 PULSE | Token distribution | `INSUFFICIENT_BALANCE` — mint more |
| 1.9 | Distribute tokens: `PulseToken.transfer(BOB, 100e18)` | DEPLOYER | BOB balance = 100 PULSE | Token distribution | — |
| 1.10 | Distribute tokens: `PulseToken.transfer(CHARLIE, 100e18)` | DEPLOYER | CHARLIE balance = 100 PULSE | Token distribution | — |

**Revert Conditions to Verify:**
- `ZeroAddress` — if `_pulseToken == address(0)` or `_signalSink == address(0)`
- `InvalidTTL` — if `_ttlSeconds == 0` or `_ttlSeconds > MAX_TTL` (30 days)
- `InvalidMinPulseAmount` — if `_minPulseAmount == 0` or `_minPulseAmount > MAX_MIN_PULSE` (1000e18)

---

### Phase 2: Ownership Verification

| Step | Function Call | Caller | Expected Result | Viz Display | Failure Mode |
|------|--------------|--------|-----------------|-------------|--------------|
| 2.1 | `owner()` | System | Yields DEPLOYER | Ownership panel | — |
| 2.2 | `pendingOwner()` | System | Yields `address(0)` | Ownership panel | — |
| 2.3 | `transferOwnership(ALICE)` | DEPLOYER | Ownership pending | Pending owner: ALICE | `OnlyOwner` revert if non-owner calls |
| 2.4 | `setTTL(7200)` | DEPLOYER | Succeeds (still owner) | TTL unchanged proof | Confirms 2-step safety |
| 2.5 | `setTTL(7200)` | ALICE | `OnlyOwner` revert | Revert logged | ALICE not yet owner |
| 2.6 | `acceptOwnership()` | ALICE | ALICE becomes owner | Owner: ALICE | `OnlyPendingOwner` if wrong caller |
| 2.7 | `setTTL(7200)` | DEPLOYER | `OnlyOwner` revert | Revert logged | DEPLOYER no longer owner |
| 2.8 | `transferOwnership(DEPLOYER)` | ALICE | DEPLOYER pending | Pending: DEPLOYER | — |
| 2.9 | `acceptOwnership()` | DEPLOYER | DEPLOYER restored | Owner: DEPLOYER | Cleanup for next phases |

**Key Security Verification:**
- Ownable2Step prevents instant ownership hijacking
- Pending owner cannot act until acceptance

---

### Phase 3: First Pulse

| Step | Function Call | Caller | Expected Result | Viz Display | Failure Mode |
|------|--------------|--------|-----------------|-------------|--------------|
| 3.1 | `agents(ALICE)` | System | All zeros (unregistered) | Agent status panel | — |
| 3.2 | `isAlive(ALICE)` | System | Yields `false` | ALICE: ❌ Dead | Confirms TTL-based logic |
| 3.3 | `PulseToken.approve(REGISTRY, 100e18)` | ALICE | Approval tx confirmed | Approval event | `ERC20_REJECT` — token problem |
| 3.4 | `pulse(1e18)` | ALICE | ✅ Pulse recorded | Pulse event, ALICE: ✅ Alive | — |
| 3.5 | `agents(ALICE)` | System | `lastPulseAt=now`, `streak=1`, `lastStreakDay=day`, `hazardScore=0` | Agent state verified | — |
| 3.6 | `isAlive(ALICE)` | System | Yields `true` | ALICE: ✅ Alive | TTL check passes |
| 3.7 | Verify `Pulse` event | System | `Pulse(ALICE, 1e18, timestamp, 1)` | Event log panel | `EVENT_MISMATCH` — log flaw |
| 3.8 | Verify sink balance | System | +1 PULSE to `0x...dEaD` | Burn counter: 1 | `TRANSFER_FAIL` — token problem |

**Revert Conditions:**
- `BelowMinimumPulse(provided, minimum)` — if `amount < minPulseAmount`
- `EnforcedPause` — if contract is paused

---

### Phase 4: Streak Building

| Step | Function Call | Caller | Expected Result | Viz Display | Failure Mode |
|------|--------------|--------|-----------------|-------------|--------------|
| 4.1 | `pulse(1e18)` | ALICE | Second pulse same day | Streak remains 1 | Same-day logic verified |
| 4.2 | `agents(ALICE)` | System | `streak=1`, same `lastStreakDay` | Streak counter: 1 | `STREAK_INCREMENTED` — logic flaw |
| 4.3 | `warp(timestamp + 1 days)` | System | Block time advanced | Time simulation active | Fork/testnet only |
| 4.4 | `pulse(1e18)` | ALICE | Pulse day 2 | Streak: 2 | — |
| 4.5 | `agents(ALICE)` | System | `streak=2`, `lastStreakDay=day+1` | Streak counter: 2 | — |
| 4.6 | `warp(timestamp + 1 days)` | System | Day 3 | — | — |
| 4.7 | `pulse(1e18)` | ALICE | Pulse day 3 | Streak: 3 | — |
| 4.8 | `getAgentStatus(ALICE)` | System | `(true, now, 3, 0)` | Full status: ✅ 3 days | Yields tuple verified |

**Edge Case Verification:**
- Same block: streak unchanged
- Same day, different block: streak unchanged
- Day boundary (timestamp / 86400 increments): streak + 1

---

### Phase 5: Missed Pulse (TTL Expiry)

| Step | Function Call | Caller | Expected Result | Viz Display | Failure Mode |
|------|--------------|--------|-----------------|-------------|--------------|
| 5.1 | `warp(timestamp + 86390)` | System | 10 seconds before TTL | TTL countdown: 10s | — |
| 5.2 | `isAlive(ALICE)` | System | Yields `true` | ALICE: ✅ Alive | Boundary test |
| 5.3 | `warp(timestamp + 1)` | System | 1 second past TTL | TTL countdown: EXPIRED | — |
| 5.4 | `isAlive(ALICE)` | System | Yields `false` | ALICE: ❌ Dead (TTL Expired) | TTL logic verified |
| 5.5 | `agents(ALICE)` | System | `lastPulseAt` unchanged, `streak=3` | Streak preserved | Streak survives TTL expiry |
| 5.6 | `warp(timestamp + 2 days)` | System | 3 days since last pulse | — | — |
| 5.7 | `pulse(1e18)` | ALICE | Pulse after long gap | Streak: 1 (RESET) | Gap detection |
| 5.8 | `agents(ALICE)` | System | `streak=1`, `lastStreakDay=current` | Reset confirmed | `STREAK_NOT_RESET` — logic flaw |

**TTL Formula Verification:**
```solidity
alive = block.timestamp <= lastPulseAt + ttlSeconds
```
- At exactly `lastPulseAt + ttlSeconds`: alive = true
- At `lastPulseAt + ttlSeconds + 1`: alive = false

---

### Phase 6: Multi-Agent Scenarios

| Step | Function Call | Caller | Expected Result | Viz Display | Failure Mode |
|------|--------------|--------|-----------------|-------------|--------------|
| 6.1 | `pulse(1e18)` | BOB | BOB's first pulse | BOB: ✅ Alive, streak: 1 | — |
| 6.2 | `pulse(1e18)` | CHARLIE | CHARLIE's first pulse | CHARLIE: ✅ Alive, streak: 1 | — |
| 6.3 | `warp(timestamp + ttl + 1)` | System | Advance past TTL | — | — |
| 6.4 | `pulse(1e18)` | BOB | BOB pulses again | BOB: ✅ Alive, ALICE: ❌, CHARLIE: ❌ | Independent TTL |
| 6.5 | `isAlive(ALICE)` | System | Yields `false` | ALICE: ❌ Dead | TTL expired |
| 6.6 | `isAlive(BOB)` | System | Yields `true` | BOB: ✅ Alive | Just pulsed |
| 6.7 | `isAlive(CHARLIE)` | System | Yields `false` | CHARLIE: ❌ Dead | TTL expired |

**Isolation Verification:**
- Each agent has independent `AgentStatus` storage slot
- One agent's actions do not affect others

---

### Phase 7: Hazard Score System

| Step | Function Call | Caller | Expected Result | Viz Display | Failure Mode |
|------|--------------|--------|-----------------|-------------|--------------|
| 7.1 | `updateHazard(ALICE, 50)` | DEPLOYER | Hazard set to 50 | ALICE hazard: 50/100 | — |
| 7.2 | `agents(ALICE)` | System | `hazardScore=50` | Hazard panel updated | — |
| 7.3 | `updateHazard(ALICE, 100)` | DEPLOYER | Hazard set to max | ALICE hazard: 100/100 | — |
| 7.4 | `updateHazard(ALICE, 101)` | DEPLOYER | `InvalidHazardScore(101, 100)` | Revert logged | Bounds check |
| 7.5 | `updateHazard(BOB, 75)` | ALICE | `OnlyOwner` revert | Revert: unauthorized | Access control |
| 7.6 | `updateHazard(0xNEW, 25)` | DEPLOYER | Hazard set for unregistered | Ghost agent hazard: 25 | Works without prior pulse |

**Revert Condition:**
- `InvalidHazardScore(score, max)` — if `score > 100`

---

### Phase 8: Emergency Pause System

| Step | Function Call | Caller | Expected Result | Viz Display | Failure Mode |
|------|--------------|--------|-----------------|-------------|--------------|
| 8.1 | `pause()` | DEPLOYER | Contract paused | 🚨 PAUSED banner | — |
| 8.2 | `paused()` | System | Yields `true` | Status: PAUSED | — |
| 8.3 | `pulse(1e18)` | BOB | `EnforcedPause` revert | Revert: paused | Pause blocks pulses |
| 8.4 | `isAlive(BOB)` | System | Yields `true` | BOB still alive (view) | View functions work |
| 8.5 | `setTTL(43200)` | DEPLOYER | Succeeds | TTL changed | Admin functions work |
| 8.6 | `unpause()` | DEPLOYER | Contract unpaused | ✅ Active banner | — |
| 8.7 | `pulse(1e18)` | BOB | Succeeds | Pulse recorded | Unpause restores functionality |
| 8.8 | `pause()` | BOB | `OnlyOwner` revert | Revert: unauthorized | Non-owner cannot pause |

**Critical Note:** View functions (`isAlive`, `getAgentStatus`, `agents`) work during pause.

---

### Phase 9: Signal Sink Verification

| Step | Action | Caller | Expected Result | Viz Display | Failure Mode |
|------|--------|--------|-----------------|-------------|--------------|
| 9.1 | Record initial sink balance | System | Baseline | Burn total: baseline | — |
| 9.2 | `pulse(5e18)` | ALICE | 5 PULSE burned | Burn total: +5 | — |
| 9.3 | Verify sink balance | System | Increased by exactly 5 PULSE | Burn counter: updated | `TRANSFER_FAIL` — token problem |
| 9.4 | Verify no mint function | System | No `mint` in ABI | No mint detected | `MINT_EXISTS` — token flaw |
| 9.5 | Verify sink is dead address | System | `0x...dEaD` has no code | Sink: verified dead | — |

**Compliance Check:**
- All tokens sent to `signalSink` are permanently burned
- No extraction mechanism exists

---

### Phase 10: Parameter Boundary Stress Test

| Step | Function Call | Caller | Expected Result | Viz Display | Failure Mode |
|------|--------------|--------|-----------------|-------------|--------------|
| 10.1 | `setTTL(0)` | DEPLOYER | `InvalidTTL` revert | Revert: zero TTL | Bounds check |
| 10.2 | `setTTL(30 days)` | DEPLOYER | Succeeds, `MAX_TTL` | TTL: 2,592,000s | At boundary |
| 10.3 | `setTTL(30 days + 1)` | DEPLOYER | `InvalidTTL` revert | Revert: exceeds max | Upper bound |
| 10.4 | `setMinPulseAmount(0)` | DEPLOYER | `InvalidMinPulseAmount` revert | Revert: zero min | Bounds check |
| 10.5 | `setMinPulseAmount(1000e18)` | DEPLOYER | Succeeds, `MAX_MIN_PULSE` | Min pulse: 1000 | At boundary |
| 10.6 | `setMinPulseAmount(1001e18)` | DEPLOYER | `InvalidMinPulseAmount` revert | Revert: exceeds max | Upper bound |
| 10.7 | `pulse(999e18)` | BOB | `BelowMinimumPulse(999e18, 1000e18)` | Revert: below min | New min enforced |
| 10.8 | `pulse(1000e18)` | BOB | Succeeds | Pulse at new boundary | — |
| 10.9 | Reset params to defaults | DEPLOYER | TTL=86400, min=1e18 | Defaults restored | Cleanup |

**Bounds Verification:**
- `MAX_TTL = 30 days` (2,592,000 seconds)
- `MAX_MIN_PULSE = 1000e18` (1000 PULSE)

---

### Phase 11: Final Liveness Check

| Step | Function Call | Caller | Expected Result | Viz Display | Failure Mode |
|------|--------------|--------|-----------------|-------------|--------------|
| 11.1 | `getAgentStatus(ALICE)` | System | Verify all fields | ALICE: complete status | — |
| 11.2 | `getAgentStatus(BOB)` | System | Verify all fields | BOB: complete status | — |
| 11.3 | `getAgentStatus(CHARLIE)` | System | Verify all fields | CHARLIE: complete status | — |
| 11.4 | Count total pulses | System | Sum of all Pulse events | Total pulses: N | Event log integrity |
| 11.5 | Count total burned | System | Sink balance - initial | Total burned: N PULSE | Token accounting |
| 11.6 | Verify owner is DEPLOYER | System | `owner() == DEPLOYER` | Ownership: verified | — |
| 11.7 | Verify not paused | System | `paused() == false` | Status: active | — |
| 11.8 | Record all contract addresses | System | Saved to deployment log | Addresses exported | — |

---

## 3. The 11-Phase Verification Sequence Summary

| Phase | Name | Key Actions | Success Criteria |
|-------|------|-------------|------------------|
| 0 | Pre-Flight | Balance checks, RPC verification | All systems green |
| 1 | Deploy | Token + Registry deployment | Contracts deployed, params verified |
| 2 | Ownership | Ownable2Step verification | Transfer requires acceptance |
| 3 | First Pulse | Initial pulse registration | Streak starts at 1, tokens burned |
| 4 | Streak Building | Multi-day pulse sequence | Streak increments correctly |
| 5 | Missed Pulse | TTL expiry and reset | isAlive=false, streak resets after gap |
| 6 | Multi-Agent | 3+ agents, independent TTL | Agents isolated, TTL independent |
| 7 | Hazard Score | Admin hazard updates | 0-100 bounds, onlyOwner |
| 8 | Emergency Pause | Pause/unpause cycle | Blocks pulse(), allows views |
| 9 | Signal Sink | Burn verification | All tokens to 0x...dEaD |
| 10 | Stress Test | Parameter boundaries | All bounds enforced |
| 11 | Final Check | Comprehensive validation | All systems nominal |

---

## 4. Visualization Dashboard Acceptance Criteria

### 4.1 Network Mode Toggle (CRITICAL)

The dashboard MUST support three distinct modes:

| Mode | RPC Endpoint | Contracts | Data Source |
|------|--------------|-----------|-------------|
| **Local Fork** | `http://local:8545` | Fresh deployment | Anvil local state |
| **Testnet** | Base Sepolia RPC | Pre-deployed addresses | Public testnet |
| **Mainnet** | Base mainnet RPC | Production addresses | Live mainnet |

**Acceptance Criteria:**
- [ ] Toggle switch visible in header
- [ ] Mode change triggers full data refresh
- [ ] Each mode maintains separate connection state
- [ ] Visual indicator shows current mode (color-coded)
- [ ] Block explorer links match selected network

### 4.2 Real-Time Metrics Panel

**Required Metrics (update every 5 seconds):**

| Metric | Source | Display Format |
|--------|--------|----------------|
| Current Block | `eth_blockNumber` | `#14,523,901` |
| Gas Cost | `eth_gasPrice` | `0.12 gwei` |
| Total Agents | `Pulse` event count | `47 active agents` |
| Total Burned | `signalSink` balance | `12,450 PULSE` |
| Current TTL | `ttlSeconds()` | `24 hours` |
| Min Pulse | `minPulseAmount()` | `1 PULSE` |
| Contract Status | `paused()` | 🟢 Active / 🔴 Paused |

### 4.3 Transaction Feed

**Requirements:**
- [ ] Real-time event streaming via WebSocket
- [ ] Filterable by: All, Pulse, Hazard, Admin
- [ ] Shows: tx hash, block, from, to, value, gas used
- [ ] Clickable tx hashes (links to block explorer)
- [ ] Auto-scroll with pause on hover
- [ ] Export to CSV option

**Event Types to Display:**
```solidity
event Pulse(address indexed agent, uint256 amount, uint256 timestamp, uint256 streak);
event HazardUpdated(address indexed agent, uint8 score);
event TTLUpdated(uint256 newTTL);
event MinPulseAmountUpdated(uint256 newMin);
```

### 4.4 Spec Compliance Panel

**Per-Network Tracking:**

| Check | Fork | Testnet | Mainnet | Status |
|-------|------|---------|---------|--------|
| PulseRegistry deployed | ⬜ | ⬜ | ⬜ | — |
| PulseToken deployed | ⬜ | ⬜ | ⬜ | — |
| Signal sink = 0x...dEaD | ⬜ | ⬜ | ⬜ | — |
| TTL = 86400 (default) | ⬜ | ⬜ | ⬜ | — |
| Min pulse = 1e18 | ⬜ | ⬜ | ⬜ | — |
| Ownable2Step active | ⬜ | ⬜ | ⬜ | — |
| Pausable functional | ⬜ | ⬜ | ⬜ | — |
| ReentrancyGuard present | ⬜ | ⬜ | ⬜ | — |
| All 68 tests pass | ⬜ | ⬜ | ⬜ | — |

**Visual States:**
- ⬜ = Not tested / Unknown
- 🟡 = In progress
- 🟢 = Pass
- 🔴 = Fail

### 4.5 Agent Status Visualization

**Individual Agent Card:**
- Address (truncated with copy button)
- Alive indicator (green pulse / grey)
- Time since last pulse (countdown)
- Current streak (fire emoji + number)
- Hazard score (progress bar 0-100, color gradient)
- Recent pulses (mini timeline)

**Aggregate Views:**
- Grid of all agents
- Filter: Alive only / All / Dead
- Sort: Last pulse time, Streak, Hazard
- Search by address

---

## 5. Risk Assessment

### 5.1 Faucet Availability (Testnet)

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Base Sepolia faucet dry | Medium | High | Maintain 3+ faucet sources; pre-fund deployer wallet with 1+ ETH |
| Throttling | High | Medium | Implement exponential backoff; use Alchemy/Infura with API keys |
| Faucet requires social auth | Medium | Medium | Document auth requirements in runbook |

**Recommended Faucets:**
1. Base official: https://www.coinbase.com/faucets/base-sepolia-faucet
2. Alchemy: https://sepoliafaucet.com/
3. QuickNode: https://faucet.quicknode.com/base-sepolia

### 5.2 RPC Throttling

| Provider | Free Tier Limit | Burst Handling |
|----------|-----------------|----------------|
| Alchemy | 300M compute/month | Request batching |
| Infura | 100k requests/day | Cache block number |
| QuickNode | 25M credits/month | WebSocket subscription |
| Public RPCs | 10 req/s | Avoid in production |

**Mitigation Strategies:**
- Implement client-side request caching (5s TTL for reads)
- Batch eth_calls where possible
- Use WebSocket for event streaming (persistent connection)
- Fallback RPC list with automatic retry

### 5.3 Testnet Congestion

| Symptom | Detection | Response |
|---------|-----------|----------|
| Gas cost > 1 gwei | `eth_gasPrice` polling | Wait for congestion to clear |
| Tx pending > 60s | Transaction receipt polling | Speed up with higher gas |
| Block time > 30s | `eth_getBlock` timestamp check | Extend delays, notify user |

### 5.4 Fork Ephemeral State

| Risk | Description | Mitigation |
|------|-------------|------------|
| State loss | Anvil restart clears all data | Document as "fresh start"; re-run deploy script |
| Time drift | `warp` affects all agents | Reset between test scenarios |
| Nonce mismatch | Reused nonces after restart | Clear wallet nonce cache on restart |
| Snapshot compatibility | Code changes invalidate snapshots | Version snapshots with commit hash |

**Fork Mode Best Practices:**
1. Always run `anvil --fork-url $BASE_RPC` fresh
2. Document expected state at each phase
3. Use deterministic deployment addresses (CREATE2 or consistent nonces)
4. Export deployment addresses immediately

### 5.5 Gas Estimation

| Operation | Estimated Gas | Buffer |
|-----------|---------------|--------|
| PulseRegistry deployment | 2.5M | 3M |
| PulseToken deployment | 1.2M | 1.5M |
| `pulse()` | 85,000 | 120,000 |
| `updateHazard()` | 35,000 | 50,000 |
| `setTTL()` | 28,000 | 40,000 |
| `pause()` | 25,000 | 35,000 |

**Testnet Gas Costs (approximate at 0.1 gwei):**
- Deployment: ~0.00037 ETH per contract
- Pulse: ~0.0000085 ETH per pulse
- Full 11-phase test: ~0.001 ETH

---

## 6. Revert Reference

### Contract Reverts

| Revert Signature | Selector | Trigger | Resolution |
|-----------------|----------|---------|------------|
| `BelowMinimumPulse(uint256,uint256)` | `0x9a55c7a2` | `pulse()` with amount < min | Increase amount |
| `InvalidHazardScore(uint256,uint256)` | `0x8e6d00f1` | `updateHazard(score > 100)` | Use 0-100 range |
| `InvalidTTL()` | `0x38068c91` | `setTTL(0)` or `> MAX_TTL` | Use 1-30 days |
| `InvalidMinPulseAmount()` | `0x7a5d8e3a` | `setMinPulseAmount(0)` or `> MAX` | Use valid range |
| `ZeroAddress()` | `0xd92e233d` | Constructor with address(0) | Fix constructor args |
| `OwnableUnauthorizedAccount(address)` | `0x118cdaa7` | Non-owner calls admin function | Use owner wallet |
| `OwnableInvalidOwner(address)` | `0x21f63d7f` | Transfer to address(0) | Use valid address |
| `EnforcedPause()` | `0xd93c0665` | `pulse()` while paused | Unpause first |
| `ExpectedPause()` | `0xd93c0665` | `unpause()` when not paused | — |

### RPC Response Codes

| Code | Meaning | Action |
|------|---------|--------|
| `-32000` | Insufficient funds | Fund wallet from faucet |
| `-32001` | Transaction rejected | Check gas limit, nonce |
| `-32002` | Method not found | Verify contract deployment |
| `-32003` | Delay | Retry with exponential backoff |
| `-32004` | Throttled | Switch RPC, add delay |
| `-32602` | Invalid params | Check function arguments |
| `-32603` | Internal | RPC provider problem, retry |

---

## 7. Deliverables Checklist

### For Agent 2 (Research Analyst)
- [ ] Selected testnet with faucet status
- [ ] Fork configuration documented
- [ ] Wallet funding status
- [ ] RPC endpoints configured with fallbacks
- [ ] Visualization stack selected (recommended: React + viem + wagmi)

### For Agent 3 (Builder)
- [ ] Deployment scripts working in all 3 modes
- [ ] Dashboard implements all acceptance criteria
- [ ] Real-time event subscription working
- [ ] Network toggle functional
- [ ] Tx feed displaying and filtering events

### For Agent 4 (Quality Auditor)
- [ ] All 11 phases executed on fork
- [ ] All 11 phases executed on testnet
- [ ] On-chain state verified against expected
- [ ] Dashboard accuracy verified
- [ ] Spec compliance report generated

### For Agent 5 (Communications Manager)
- [ ] Dashboard deployed and accessible
- [ ] Screenshots/recordings captured
- [ ] Delivery package assembled
- [ ] Documentation published

---

## 8. Appendix

### A. Contract ABI Snippets

**PulseRegistry Core Functions:**
```solidity
function pulse(uint256 amount) external;
function isAlive(address agent) external view yields (bool);
function getAgentStatus(address agent) external view yields (bool, uint256, uint256, uint256);
function agents(address) external view yields (uint64 lastPulseAt, uint32 streak, uint32 lastStreakDay, uint8 hazardScore);

function updateHazard(address agent, uint8 score) external;
function setTTL(uint256 newTTL) external;
function setMinPulseAmount(uint256 newMin) external;
function pause() external;
function unpause() external;

function pulseToken() external view yields (address);
function signalSink() external view yields (address);
function ttlSeconds() external view yields (uint256);
function minPulseAmount() external view yields (uint256);
function MAX_TTL() external pure yields (uint256);
function MAX_MIN_PULSE() external pure yields (uint256);
```

### B. Foundry Test Command Reference

```bash
# Run all tests
cd /opt/fundbot/work/workspace-connie/agent-pulse/packages/contracts
forge test

# Run specific test contract
forge test --match-contract PulseRegistryTest

# Run with verbosity
forge test -vvv

# Run exploit tests
forge test --match-contract PulseRegistryExploitTest -vvv
forge test --match-contract PulseRegistryExploit -vvv

# Fork testing (against live Base)
forge test --fork-url $BASE_RPC --match-contract PulseRegistryTest
```

### C. Environment Variables Required

```bash
# Required for all modes
export PRIVATE_KEY_DEPLOYER="0x..."
export PRIVATE_KEY_ALICE="0x..."
export PRIVATE_KEY_BOB="0x..."
export PRIVATE_KEY_CHARLIE="0x..."

# RPC endpoints
export BASE_RPC="https://mainnet.base.org"
export BASE_SEPOLIA_RPC="https://sepolia.base.org"
export ANVIL_RPC="http://local:8545"

# Contract addresses (populated after deployment)
export PULSE_TOKEN_ADDRESS=""
export PULSE_REGISTRY_ADDRESS=""
```

---

*End of Verification Plan — Document Version 1.0*
