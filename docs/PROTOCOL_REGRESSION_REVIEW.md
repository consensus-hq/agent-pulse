# Protocol Regression Review — BLOCKING

Status: OPEN — All 10 issues must be resolved before x402 integration.
Filed: 2026-02-05 by Romy
Assignee: Connie

See full issue descriptions in chat. Tracking resolution here.

## Issues

| # | Issue | Status | Resolution |
|---|-------|--------|------------|
| 1 | RPC death invalidates test run | RESOLVED | Foundry tests run in-memory EVM — no RPC dependency. 69/69 pass. |
| 2 | Show actual test code | RESOLVED | 40 tests in PulseRegistry.t.sol (473 lines), 13+13+3 exploit/abuse tests — all real EVM |
| 3 | Streak + TTL are not optional | RESOLVED | vm.warp tests cover streak build, day boundary, exact TTL boundary, 20h gap enforcement |
| 4 | JSON storage not production | IN PROGRESS | Agent 1.1 (KV Schema) + 1.2-1.5 building full Vercel KV architecture |
| 5 | What does 9/11 actually prove | RESOLVED | Agent 3.4 mapping all 69 tests to specific assertions and issues |
| 6 | Replay without chain state is theater | IN PROGRESS | Agent 3.1 building deterministic replay from fresh Anvil fork |
| 7 | Error handling + revert testing | RESOLVED | 15+ revert tests: BelowMinimumPulse, insufficient balance, no approval, owner-only, constructor validation |
| 8 | Gas profiling | RESOLVED | forge test --gas-report: pulse() avg 70,898 gas, isAlive() 5,868, deploy 1.6M |
| 9 | Contract upgrade path | IN PROGRESS | Agents 2.1-2.5 building migration spec, deprecation function, Safe ownership, v2 contract |
| 10 | Battle-tested articulation | IN PROGRESS | Agent 3.2 (Wave 2) will map 5 claims to specific test evidence from 3.4's catalog |
