# QA Verification Framework — Pulse of Life Protocol

**Version:** 1.0
**Date:** 2026-02-05
**Author:** Agent 4 (Quality Auditor)
**Scope:** On-chain evidence criteria, dashboard accuracy, 3-mode toggle, mainnet fork checks, cross-network comparison

---

## 1. Per-Phase On-Chain Evidence Requirements

Each of the 11 verification phases must produce specific on-chain evidence, verifiable tx receipt data, and matching dashboard state. The auditor checks all three columns independently.

### Phase 0: Pre-Flight Checks

| Check | On-Chain Evidence | Tx Receipt Verification | Dashboard Must Show |
|-------|-------------------|-------------------------|---------------------|
| Deployer balance sufficient | `eth_getBalance(DEPLOYER)` returns value above threshold | N/A (read-only call) | Wallet balance widget shows non-zero balance |
| RPC connectivity | `eth_blockNumber` returns a positive integer within expected range | N/A (read-only call) | Network status indicator is green |
| Token faucet operational (testnet) | Test mint or transfer tx succeeds | `status: 1` on faucet tx | Faucet status shown if applicable |
| ABIs loaded | N/A (client-side) | N/A | ABI loaded indicator active; no console errors |

**Pass Criteria:** All pre-flight checks return expected values without timeout. Dashboard reflects live RPC connection (current block number incrementing).

---

### Phase 1: Contract Deployment

| Check | On-Chain Evidence | Tx Receipt Verification | Dashboard Must Show |
|-------|-------------------|-------------------------|---------------------|
| PulseToken deployed | `eth_getCode(TOKEN_ADDR)` returns non-empty bytecode | Receipt: `status: 1`, `contractAddress` populated | Token address in config panel |
| PulseRegistry deployed | `eth_getCode(REGISTRY_ADDR)` returns non-empty bytecode | Receipt: `status: 1`, `contractAddress` populated | Registry address in config panel |
| Constructor params correct | `pulseToken()` returns TOKEN, `signalSink()` returns `0x...dEaD`, `ttlSeconds()` returns 86400, `minPulseAmount()` returns `1e18` | N/A (read calls) | Config panel shows: TTL 24h, Min Pulse 1 PULSE |
| Token distribution | `balanceOf(ALICE)`, `balanceOf(BOB)`, `balanceOf(CHARLIE)` each return expected amount | Transfer receipt: `status: 1`, Transfer event with correct `to` and `value` | Token distribution amounts visible |
| Constructor revert guards | Deploy with `address(0)` token reverts with `ZeroAddress`; TTL 0 reverts with `InvalidTTL`; minPulse 0 reverts with `InvalidMinPulseAmount` | No receipt (tx reverted) | N/A (negative test) |

**Pass Criteria:** Both contracts deployed, all four immutable/mutable params verified via direct calls, token balances distributed to test wallets.

---

### Phase 2: Ownership Verification

| Check | On-Chain Evidence | Tx Receipt Verification | Dashboard Must Show |
|-------|-------------------|-------------------------|---------------------|
| Initial owner correct | `owner()` returns DEPLOYER address | N/A (read call) | Ownership panel shows DEPLOYER |
| No pending owner initially | `pendingOwner()` returns `address(0)` | N/A (read call) | No pending owner displayed |
| Transfer sets pending | After `transferOwnership(ALICE)`: `pendingOwner()` returns ALICE, `owner()` still returns DEPLOYER | Receipt: `status: 1`, `OwnershipTransferStarted` event with `previousOwner` and `newOwner` | Pending owner: ALICE shown |
| Pending owner cannot admin | `setTTL(7200)` from ALICE reverts with `OwnableUnauthorizedAccount` | No receipt (reverted) | Revert logged in tx feed |
| Accept completes transfer | `acceptOwnership()` from ALICE: `owner()` returns ALICE | Receipt: `status: 1`, `OwnershipTransferred` event | Owner: ALICE |
| Old owner loses access | `setTTL(7200)` from DEPLOYER reverts | No receipt (reverted) | Revert logged in tx feed |
| Restore ownership | Transfer back to DEPLOYER via 2-step | Two receipts: transfer + accept both `status: 1` | Owner: DEPLOYER (restored) |

**Pass Criteria:** Ownable2Step verified: transfer requires explicit `acceptOwnership()`, pending owner has no admin power, old owner loses power immediately on acceptance.

---

### Phase 3: First Pulse

| Check | On-Chain Evidence | Tx Receipt Verification | Dashboard Must Show |
|-------|-------------------|-------------------------|---------------------|
| Agent unregistered before pulse | `agents(ALICE)` returns all zeros; `isAlive(ALICE)` returns `false` | N/A (read calls) | ALICE: Dead indicator |
| Approval tx | `allowance(ALICE, REGISTRY)` returns approved amount | Receipt: `status: 1`, `Approval` event | Approval confirmed |
| First pulse succeeds | `agents(ALICE).lastPulseAt > 0`, `.streak == 1`, `.lastStreakDay == block.timestamp / 86400` | Receipt: `status: 1`, `Pulse(ALICE, 1e18, timestamp, 1)` event in logs | ALICE: Alive, streak 1 |
| isAlive flips to true | `isAlive(ALICE)` returns `true` | N/A (read call) | ALICE: green alive indicator |
| Tokens burned to sink | `balanceOf(0x...dEaD)` increased by exactly `1e18` | `Transfer(ALICE, 0x...dEaD, 1e18)` event in receipt logs | Burn counter incremented |
| Below-minimum reverts | `pulse(minPulse - 1)` reverts | Receipt absent; error matches `BelowMinimumPulse(provided, minimum)` | Revert shown in tx feed |

**Pass Criteria:** First pulse sets streak to 1, `isAlive` flips true, exactly `1e18` tokens reach sink. `Pulse` event emitted with correct indexed `agent` and correct `amount`, `timestamp`, `streak` fields.

---

### Phase 4: Streak Building

| Check | On-Chain Evidence | Tx Receipt Verification | Dashboard Must Show |
|-------|-------------------|-------------------------|---------------------|
| Same-day pulse: streak unchanged | After second pulse same day: `agents(ALICE).streak == 1` | Receipt: `Pulse` event with `streak = 1` | Streak counter: 1 (unchanged) |
| Day+1 pulse: streak increments | After warp +1 day and pulse: `agents(ALICE).streak == 2` | Receipt: `Pulse` event with `streak = 2` | Streak counter: 2 |
| Day+2 pulse: streak increments again | After warp +1 more day: `agents(ALICE).streak == 3` | Receipt: `Pulse` event with `streak = 3` | Streak counter: 3 |
| getAgentStatus returns tuple | `getAgentStatus(ALICE)` returns `(true, lastPulseAt, 3, 0)` | N/A (read call) | Full agent card: alive, streak 3, hazard 0 |

**Pass Criteria:** Same-day duplicate pulses do not increment streak. Consecutive-day pulses increment by exactly 1. `lastStreakDay` tracks `block.timestamp / 86400`.

---

### Phase 5: Missed Pulse (TTL Expiry)

| Check | On-Chain Evidence | Tx Receipt Verification | Dashboard Must Show |
|-------|-------------------|-------------------------|---------------------|
| Alive at TTL boundary | At `lastPulseAt + ttlSeconds`: `isAlive(ALICE)` returns `true` | N/A (read call) | ALICE: Alive (boundary) |
| Dead 1 second past TTL | At `lastPulseAt + ttlSeconds + 1`: `isAlive(ALICE)` returns `false` | N/A (read call) | ALICE: Dead (TTL expired) |
| Streak preserved while expired | `agents(ALICE).streak == 3` (unchanged from phase 4) | N/A (read call) | Streak still shows 3 |
| Gap resets streak | After 2+ day gap, new pulse: `agents(ALICE).streak == 1` | Receipt: `Pulse` event with `streak = 1` | Streak: 1 (reset) |

**Pass Criteria:** `isAlive` formula is `block.timestamp <= lastPulseAt + ttlSeconds` (inclusive at boundary). Streak is not cleared by TTL expiry alone; it resets only on a pulse after a multi-day gap.

---

### Phase 6: Multi-Agent Scenarios

| Check | On-Chain Evidence | Tx Receipt Verification | Dashboard Must Show |
|-------|-------------------|-------------------------|---------------------|
| Multiple agents can pulse | `agents(BOB).streak == 1`, `agents(CHARLIE).streak == 1` after their first pulses | Two separate `Pulse` events with correct `agent` index | BOB and CHARLIE agent cards: Alive |
| Independent TTL expiry | After TTL+1: ALICE and CHARLIE dead, BOB re-pulses and is alive | `isAlive(BOB)` true, `isAlive(ALICE)` false, `isAlive(CHARLIE)` false | Correct alive/dead status per agent |
| Agent isolation | BOB's pulse does not affect ALICE's or CHARLIE's state | No state change events for ALICE/CHARLIE in BOB's receipt | ALICE and CHARLIE statuses unchanged |

**Pass Criteria:** Each agent has an independent `AgentStatus` storage slot. One agent's `pulse()` has zero side effects on other agents.

---

### Phase 7: Hazard Score System

| Check | On-Chain Evidence | Tx Receipt Verification | Dashboard Must Show |
|-------|-------------------|-------------------------|---------------------|
| Set hazard to 50 | `agents(ALICE).hazardScore == 50` | Receipt: `HazardUpdated(ALICE, 50)` event | ALICE hazard bar at 50/100 |
| Set hazard to max (100) | `agents(ALICE).hazardScore == 100` | Receipt: `HazardUpdated(ALICE, 100)` event | ALICE hazard bar at 100/100 |
| Score 101 reverts | `updateHazard(ALICE, 101)` reverts | Error: `InvalidHazardScore(101, 100)` | Revert logged |
| Non-owner reverts | `updateHazard(BOB, 75)` from ALICE reverts | Error: `OwnableUnauthorizedAccount(ALICE)` | Revert logged |
| Unregistered agent allowed | `updateHazard(0xNEW, 25)` succeeds; `agents(0xNEW).hazardScore == 25` | Receipt: `HazardUpdated(0xNEW, 25)` | Ghost agent hazard visible if queried |

**Pass Criteria:** Hazard scores bounded 0-100, onlyOwner enforced, can be set on never-pulsed addresses without error.

---

### Phase 8: Emergency Pause System

| Check | On-Chain Evidence | Tx Receipt Verification | Dashboard Must Show |
|-------|-------------------|-------------------------|---------------------|
| Pause succeeds | `paused()` returns `true` | Receipt: `Paused(DEPLOYER)` event (from OZ Pausable) | PAUSED banner / red indicator |
| pulse() blocked while paused | `pulse(1e18)` from BOB reverts with `EnforcedPause` | No receipt (reverted) | Revert shown in feed |
| View functions work during pause | `isAlive(BOB)` returns result, `getAgentStatus` returns result | N/A (read calls succeed) | Agent statuses still queryable |
| Admin functions work during pause | `setTTL(43200)` from DEPLOYER succeeds | Receipt: `TTLUpdated(43200)` | TTL updated in config panel |
| Unpause succeeds | `paused()` returns `false` | Receipt: `Unpaused(DEPLOYER)` event | Active banner / green indicator |
| pulse() works after unpause | `pulse(1e18)` from BOB succeeds | Receipt: `Pulse` event | BOB: Alive |
| Non-owner cannot pause | `pause()` from BOB reverts | Error: `OwnableUnauthorizedAccount(BOB)` | Revert logged |

**Pass Criteria:** `whenNotPaused` modifier blocks `pulse()` only. All `view` and `onlyOwner` functions remain accessible. `Paused`/`Unpaused` events emitted by OZ Pausable.

---

### Phase 9: Signal Sink Verification

| Check | On-Chain Evidence | Tx Receipt Verification | Dashboard Must Show |
|-------|-------------------|-------------------------|---------------------|
| Baseline sink balance recorded | `balanceOf(0x...dEaD)` at start of phase | N/A | Burn total: baseline value |
| Large pulse burns correctly | After `pulse(5e18)`: sink balance increased by exactly `5e18` | Receipt: `Transfer(ALICE, 0x...dEaD, 5e18)` event | Burn counter: +5 |
| Sink has no code | `eth_getCode(0x...dEaD)` returns `0x` | N/A | Sink verified as EOA/dead address |
| signalSink is immutable | No `setSignalSink` function in ABI | N/A | Sink address shown as immutable in config |
| Cumulative accounting correct | Total sink balance equals sum of all `Pulse` event amounts | Cross-reference all `Transfer` events to sink | Total burned figure matches |

**Pass Criteria:** Every token sent via `pulse()` arrives at `0x...dEaD` with exact amount (no fee-on-transfer issues with actual PULSE token). Sink address is immutable constructor parameter.

---

### Phase 10: Parameter Boundary Stress Test

| Check | On-Chain Evidence | Tx Receipt Verification | Dashboard Must Show |
|-------|-------------------|-------------------------|---------------------|
| setTTL(0) reverts | Revert with `InvalidTTL` | No receipt | Revert logged |
| setTTL(MAX_TTL) succeeds | `ttlSeconds() == 2592000` (30 days) | Receipt: `TTLUpdated(2592000)` | TTL: 30 days |
| setTTL(MAX_TTL + 1) reverts | Revert with `InvalidTTL` | No receipt | Revert logged |
| setMinPulseAmount(0) reverts | Revert with `InvalidMinPulseAmount` | No receipt | Revert logged |
| setMinPulseAmount(MAX) succeeds | `minPulseAmount() == 1000e18` | Receipt: `MinPulseAmountUpdated(1000e18)` | Min Pulse: 1000 |
| setMinPulseAmount(MAX + 1) reverts | Revert with `InvalidMinPulseAmount` | No receipt | Revert logged |
| Pulse below new min reverts | `pulse(999e18)` reverts with `BelowMinimumPulse(999e18, 1000e18)` | No receipt | Revert logged |
| Pulse at exact new min succeeds | `pulse(1000e18)` succeeds | Receipt: `Pulse` event | Pulse recorded |
| Params restored to defaults | `ttlSeconds() == 86400`, `minPulseAmount() == 1e18` | Two receipts: `TTLUpdated(86400)`, `MinPulseAmountUpdated(1e18)` | Config panel: defaults |

**Pass Criteria:** All boundary conditions enforced. `MAX_TTL = 30 days`, `MAX_MIN_PULSE = 1000e18`. Both lower bound (0) and upper bound (MAX + 1) rejected.

---

### Phase 11: Final Liveness Check

| Check | On-Chain Evidence | Tx Receipt Verification | Dashboard Must Show |
|-------|-------------------|-------------------------|---------------------|
| ALICE status complete | `getAgentStatus(ALICE)` returns consistent tuple | N/A | Full agent card for ALICE |
| BOB status complete | `getAgentStatus(BOB)` returns consistent tuple | N/A | Full agent card for BOB |
| CHARLIE status complete | `getAgentStatus(CHARLIE)` returns consistent tuple | N/A | Full agent card for CHARLIE |
| Total pulse count | Count of all `Pulse` events matches expected | Cross-reference event log | Total pulses: N |
| Total burned | `balanceOf(0x...dEaD)` minus initial equals sum of all pulse amounts | Cross-reference Transfer events | Total burned: N PULSE |
| Owner correct | `owner()` returns DEPLOYER | N/A | Ownership: DEPLOYER |
| Not paused | `paused()` returns `false` | N/A | Status: Active (green) |
| All addresses recorded | Registry, Token, Sink addresses documented | N/A | Addresses exported to deployment log |

**Pass Criteria:** All agent statuses queryable, event counts match expected totals, token accounting balanced (minted = distributed + burned + remaining), owner and pause state as expected.

---

## 2. Dashboard Accuracy Checklist

The dashboard must be verified against on-chain truth for every data point it displays. The auditor performs these checks after each phase completes.

### 2.1 isAlive Status Accuracy

| Check | Method | Pass Criteria |
|-------|--------|---------------|
| Alive agent shows alive | Call `isAlive(agent)` on-chain, compare to dashboard indicator | Dashboard green/alive matches `true` return |
| Dead agent shows dead | Call `isAlive(agent)` on-chain after TTL expiry | Dashboard grey/dead matches `false` return |
| TTL boundary transition | Query at `lastPulseAt + ttlSeconds` and `+1` | Dashboard transitions at correct moment |
| Never-pulsed agent | Query agent with no history | Dashboard shows dead/unregistered, not error |
| Post-unpause status | After pause/unpause cycle, check all agents | All statuses match chain state |

### 2.2 Streak Count Accuracy

| Check | Method | Pass Criteria |
|-------|--------|---------------|
| Initial streak | Read `agents(addr).streak` on-chain | Dashboard streak count matches exactly |
| After same-day pulse | Verify streak unchanged on-chain | Dashboard does not increment |
| After next-day pulse | Verify streak incremented on-chain | Dashboard increments by exactly 1 |
| After gap reset | Verify streak reset to 1 on-chain | Dashboard shows 1, not previous value |
| Multiple agents | Check each agent's streak independently | No cross-contamination between agent cards |

### 2.3 Hazard Score Accuracy

| Check | Method | Pass Criteria |
|-------|--------|---------------|
| Score display | Read `agents(addr).hazardScore` on-chain | Dashboard progress bar value matches |
| Score update reflected | After `updateHazard()`, re-check dashboard | New score displayed within refresh cycle (5s) |
| Score color gradient | Score 0 = green, 50 = yellow, 100 = red | Visual gradient matches score numerically |
| Zero score display | Unset hazard shows 0 | Dashboard shows 0/100, not blank or error |

### 2.4 Pause State Accuracy

| Check | Method | Pass Criteria |
|-------|--------|---------------|
| Active state | `paused()` returns `false` | Dashboard: green "Active" indicator |
| Paused state | `paused()` returns `true` | Dashboard: red "PAUSED" banner visible |
| Transition timing | Pause/unpause and verify dashboard updates | Dashboard reflects change within refresh cycle |
| Pulse button state | While paused, pulse action should be disabled or show warning | UI prevents or warns against pulsing while paused |

### 2.5 Transaction Feed Accuracy

| Check | Method | Pass Criteria |
|-------|--------|---------------|
| Pulse events appear | Send pulse, verify event in feed | Feed shows `Pulse` event with correct agent, amount, streak |
| HazardUpdated events appear | Update hazard, verify event in feed | Feed shows `HazardUpdated` event with correct agent, score |
| TTLUpdated events appear | Change TTL, verify event in feed | Feed shows `TTLUpdated` with new value |
| MinPulseAmountUpdated events appear | Change min pulse, verify event in feed | Feed shows `MinPulseAmountUpdated` with new value |
| Paused/Unpaused events appear | Pause and unpause, verify feed | Feed shows both OZ Pausable events |
| Tx hash linkable | Click tx hash in feed | Opens correct block explorer page for that tx |
| Event data matches chain | Compare feed event data to `eth_getTransactionReceipt` logs | All fields match: indexed params, data fields, block number |
| Chronological order | Send multiple txs rapidly | Feed displays in correct block/logIndex order |
| Filter functionality | Apply Pulse/Hazard/Admin filters | Only matching event types shown |

### 2.6 Explorer Link Accuracy

| Check | Method | Pass Criteria |
|-------|--------|---------------|
| Tx hash links | Click any tx hash link | Opens `basescan.org/tx/0x...` (mainnet) or `sepolia.basescan.org/tx/0x...` (testnet) |
| Address links | Click any address link | Opens correct explorer address page |
| Network-correct links | Switch modes and verify links | Testnet links go to Sepolia explorer, mainnet to mainnet explorer, fork shows local info or no links |
| Contract address links | Click registry/token address | Opens verified contract page if available |

### 2.7 Real-Time Metrics Accuracy

| Check | Method | Pass Criteria |
|-------|--------|---------------|
| Current block | Compare to `eth_blockNumber` RPC call | Dashboard value within 1 block of direct RPC query |
| Gas price | Compare to `eth_gasPrice` RPC call | Dashboard value within 10% of direct query |
| Total agents | Count unique addresses with `Pulse` events | Dashboard count matches event log scan |
| Total burned | Query `balanceOf(0x...dEaD)` directly | Dashboard value matches to 18 decimal precision |
| TTL display | Query `ttlSeconds()` directly | Dashboard shows human-readable format matching raw value |
| Min pulse display | Query `minPulseAmount()` directly | Dashboard shows formatted value matching raw |
| Contract status | Query `paused()` directly | Dashboard indicator matches boolean |

---

## 3. Three-Mode Toggle Verification

The dashboard must support testnet, local fork, and mainnet modes. Each mode must be verified independently for correct data isolation.

### 3.1 Testnet Mode

| Check | Expected Behavior | Verification Method |
|-------|-------------------|---------------------|
| RPC connection | Connects to Base Sepolia (`chainId: 84532`) | `eth_chainId` returns `0x14a34` (84532) |
| Block numbers are live | Block number increases over time | Poll `eth_blockNumber` twice with 5s gap |
| Contracts deployed on Sepolia | Registry and Token at expected Sepolia addresses | `eth_getCode` returns bytecode at testnet addresses |
| Explorer links point to Sepolia | All links use `sepolia.basescan.org` | Inspect link hrefs |
| Events are from Sepolia | Pulse events match Sepolia tx hashes | Cross-reference tx hashes on `sepolia.basescan.org` |
| Gas prices are Sepolia-realistic | Gas price in testnet range (typically low) | `eth_gasPrice` returns reasonable L2 testnet value |
| No mainnet data leakage | No mainnet addresses or mainnet block numbers shown | Visual inspection; search for mainnet chainId 8453 |

### 3.2 Fork Mode

| Check | Expected Behavior | Verification Method |
|-------|-------------------|---------------------|
| RPC connection | Connects to `localhost:8545` (Anvil) | `eth_chainId` returns fork chainId |
| Fork-from block visible | Dashboard shows which mainnet block the fork started from | Anvil `--fork-block-number` matches displayed value |
| FORK badge displayed | Clear visual indicator this is forked/local state | UI shows "FORK" badge, distinct color scheme |
| Fresh deployments used | Registry and Token are freshly deployed addresses (not mainnet) | Addresses differ from mainnet/testnet; `eth_getCode` at those addresses returns bytecode |
| Time manipulation works | `warp` advances block.timestamp; dashboard reflects new time | After warp, dashboard metrics update |
| No testnet data confusion | No Sepolia addresses, no Sepolia explorer links | Visual inspection |
| Explorer links disabled or local | Tx hash links do not point to public explorers | Links either disabled, point to local, or clearly labeled "(local)" |
| Ephemeral state warning | User informed that fork state is not persistent | Warning banner or tooltip present |

### 3.3 Mainnet Mode

| Check | Expected Behavior | Verification Method |
|-------|-------------------|---------------------|
| RPC connection | Connects to Base mainnet (`chainId: 8453`) | `eth_chainId` returns `0x2105` (8453) |
| "Not deployed" shown (if pre-deploy) | If contracts not yet deployed, dashboard shows clear message | No errors; clean "Not yet deployed on mainnet" state |
| Contracts accessible (if deployed) | Registry and Token at mainnet addresses respond | `eth_getCode` returns bytecode at mainnet addresses |
| Explorer links point to mainnet | All links use `basescan.org` (not sepolia) | Inspect link hrefs |
| No testnet data shown | No Sepolia addresses, no test agent data | Visual inspection |
| Live block data | Block numbers match Base mainnet head | Cross-reference with `basescan.org` |

### 3.4 Cross-Mode Isolation

| Check | Expected Behavior | Verification Method |
|-------|-------------------|---------------------|
| Mode switch clears data | Switching modes triggers full data refresh | No stale data from previous mode visible |
| Separate connection state | Each mode maintains its own provider/state | Switching back and forth preserves no cross-mode artifacts |
| No address confusion | Testnet addresses never shown in mainnet mode and vice versa | Compare displayed addresses to expected per-mode addresses |
| Event feeds are mode-specific | Tx feed only shows events from current mode's chain | Switch modes; verify feed is repopulated with correct events |
| Agent statuses are mode-specific | Agent alive/dead status reflects current mode's chain | Same address may have different status on testnet vs fork |

---

## 4. Mainnet Fork Specific Checks

The mainnet fork (Anvil) serves as a rehearsal environment that mimics mainnet conditions. These checks validate that the fork accurately represents mainnet behavior.

### 4.1 Gas Cost Plausibility

| Check | Expected | How to Verify |
|-------|----------|---------------|
| Deployment gas | 2,000,000 to 3,500,000 gas for PulseRegistry | Compare `gasUsed` in deploy receipt to testnet deploy receipt |
| pulse() gas | 80,000 to 120,000 gas (first pulse higher due to storage init) | Compare `gasUsed` in pulse receipt |
| Admin function gas | 25,000 to 50,000 gas per admin call | Compare `gasUsed` to testnet equivalents |
| Gas price realism | Fork gas price should reflect mainnet levels at fork block | `eth_gasPrice` on fork vs recent mainnet gas prices |
| L1 data cost estimation | Base L2 includes L1 data posting cost | Check if `effectiveGasPrice` reflects L1+L2 components |

### 4.2 Stress Test Behavior Comparison

| Check | Expected | Concerning If |
|-------|----------|---------------|
| Rapid pulse sequence (10 txs) | All succeed, gas consistent | Gas usage varies wildly between txs |
| Multiple agents simultaneously | No contention; each succeeds | Tx failures or unexpected reverts |
| Parameter changes under load | setTTL/setMinPulse succeed immediately | Delays or failures during active pulsing |
| Pause during active pulsing | Pause blocks subsequent pulses immediately | Any pulse succeeds after pause tx is mined |
| Large pulse amounts | `pulse(1000e18)` at MAX_MIN_PULSE works | Unexpected gas increase for large amounts |

### 4.3 Fork Verification Log Completeness

The fork verification session must produce a complete log. The auditor checks the log contains all required entries.

| Required Log Entry | Format | Purpose |
|--------------------|--------|---------|
| Fork source block | `forked from block #N at timestamp T` | Reproducibility |
| Anvil version | `anvil version X.Y.Z` | Tool versioning |
| All deploy tx hashes | `deployed PulseRegistry at 0x... (tx: 0x...)` | Audit trail |
| All verification tx hashes | Per-phase tx list | Evidence chain |
| Gas used per operation | `pulse() gas: N` | Cost analysis |
| All revert tests | `setTTL(0) reverted with InvalidTTL: PASS` | Negative test proof |
| State snapshots | `agents(ALICE) after phase 4: {streak: 3, ...}` | State verification |
| Final state summary | All agent statuses, total burned, owner, pause state | Completeness |
| Timestamp of each action | ISO 8601 timestamps | Timeline reconstruction |

---

## 5. Cross-Network Comparison Criteria

When the same 11-phase verification runs on both testnet and fork, the auditor compares results using these criteria.

### 5.1 Expected Differences (Normal)

| Dimension | Testnet | Fork | Why It Differs |
|-----------|---------|------|----------------|
| Contract addresses | Unique Sepolia addresses | Unique local addresses | Different deployers/nonces |
| Block numbers | High (Sepolia head) | Low (fork-relative) or high (forked mainnet block) | Different chains |
| Tx hashes | Globally unique on Sepolia | Locally unique on Anvil | Different chain contexts |
| Block timestamps | Real wall-clock time | Manipulated via `warp` | Fork uses simulated time |
| Gas prices | Sepolia gas market | Forked mainnet gas snapshot | Different fee markets |
| Tx confirmation time | 2-4 seconds (L2 blocks) | Instant (Anvil auto-mine) | Local vs network latency |
| Explorer availability | Full Sepolia BaseScan | No public explorer | Public vs local chain |
| Token supply context | May have other holders | Only test wallets hold tokens | Isolated environment |
| L1 data costs | Real Sepolia L1 costs | Snapshot of mainnet L1 costs | Different L1 fee contexts |

### 5.2 Expected Similarities (Must Match)

| Dimension | Requirement | Concern If Different |
|-----------|-------------|----------------------|
| Event signatures | Identical event topics and data encoding | ABI mismatch or different contract version |
| Revert error selectors | Same error signatures for same invalid inputs | Contract logic divergence |
| State transitions | Same inputs produce same state changes | Non-deterministic behavior |
| Gas usage (approximate) | Within 15% for same operations | Compiler or optimizer difference |
| Storage layout | Same slot packing (uint64+uint32+uint32+uint8 = 1 slot) | Struct layout changed |
| Function return values | Same inputs yield same outputs | Logic bug |
| Access control behavior | Same callers blocked/allowed | Permission misconfiguration |
| Boundary values | Same MAX_TTL, MAX_MIN_PULSE constants | Constant changed between deploys |

### 5.3 Concerning Differences (Investigate)

| Signal | What It May Indicate | Action |
|--------|----------------------|--------|
| Gas usage differs by more than 20% | Different compiler settings, optimizer runs, or EVM version | Compare foundry.toml profiles; verify solc version |
| Different revert reasons for same input | Contract bytecode differs | Compare bytecodes with `eth_getCode` |
| Event data mismatch for same operation | ABI encoding issue | Verify both use same ABI |
| State divergence after identical input sequence | Non-deterministic or timestamp-dependent logic | Check for `block.timestamp` dependencies in divergent state |
| Streak logic differs | Day boundary calculation affected by different base timestamps | Verify `block.timestamp / 86400` consistency |
| isAlive differs for same agent after same sequence | TTL calculation interacts with different timestamps | Expected if wall-clock time passed differently; verify formula |
| Pause behavior differs | Different OZ version or import | Compare OpenZeppelin dependency versions |
| Token balance accounting off | Fee-on-transfer or rounding issue | Verify token contract is identical (same ERC-20 impl) |

### 5.4 Cross-Network Comparison Procedure

1. **Run fork verification first** — capture all state transitions and gas usage
2. **Run testnet verification second** — use same input sequence
3. **Compare outputs side-by-side** using the Spec Alignment Report template
4. **Flag all differences** — categorize as Expected, Acceptable, or Concerning
5. **Investigate Concerning items** — determine root cause before signing off
6. **Document in deviation log** — every difference with classification and rationale

---

## 6. Automated Check Scripts

The auditor should use or request the following automated checks where possible.

### 6.1 On-Chain State Verification Script

For each phase, the following read calls should be scripted and run against the live chain:

```
// Pseudo-script: verify-phase.ts
const registry = getContract(REGISTRY_ADDR);
const token = getContract(TOKEN_ADDR);

// Verify config
assert(await registry.pulseToken() === TOKEN_ADDR);
assert(await registry.signalSink() === "0x...dEaD");
assert(await registry.ttlSeconds() === expectedTTL);
assert(await registry.minPulseAmount() === expectedMin);

// Verify agent state
const status = await registry.getAgentStatus(ALICE);
assert(status.alive === expectedAlive);
assert(status.streak === expectedStreak);

// Verify token accounting
const sinkBalance = await token.balanceOf("0x...dEaD");
assert(sinkBalance === expectedBurned);
```

### 6.2 Event Log Integrity Script

```
// Pseudo-script: verify-events.ts
const pulseEvents = await registry.queryFilter("Pulse");
const totalPulseAmount = pulseEvents.reduce((sum, e) => sum + e.args.amount, 0n);
const sinkBalance = await token.balanceOf("0x...dEaD");
assert(totalPulseAmount === sinkBalance, "Event sum must equal sink balance");
```

### 6.3 Dashboard Snapshot Comparison

For each phase:
1. Take a screenshot of the dashboard state
2. Query on-chain state via RPC
3. Verify every displayed value matches the RPC result
4. Log any discrepancy with severity (display error vs data error)

---

## 7. Compliance Verification

These checks ensure the protocol and dashboard comply with project rules.

| Check | Requirement | Verification |
|-------|-------------|--------------|
| No investment language | Dashboard text uses "utility token," "pulse signals," "liveness" only | Manual text review of all UI copy |
| No contract addresses in public output | Addresses only in LINKS.md; dashboard may show truncated with copy button | Inspect page source; verify no full addresses in meta tags or public API responses |
| Signal sink = burn address | `signalSink()` returns `0x000000000000000000000000000000000000dEaD` | On-chain read call |
| No DEX/trading references | No links to Uniswap, trading pairs, price data | Manual UI review |
| Correct framing | "Paid eligibility," "routing signal," "anti-spam friction" | Check all tooltip and label text |

---

*QA Verification Framework v1.0 — Agent 4 (Quality Auditor)*
*Generated: 2026-02-05*
