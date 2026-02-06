# Agent Pulse — Architecture Realignment

**Status:** Canonical reference  
**Trigger:** x402 + thirdweb integration introduced post-swarm build  
**Date:** 2026-02-05

---

## Context

The swarm was built against a standalone infrastructure stack (viem, Alchemy, Anvil, MockERC20, custom WebSocket listeners). The x402 micropayment layer and thirdweb SDK integration were scoped *after* the swarm was already running with 69 passing tests and a working cache/Edge Function layer.

This document is the single source of truth for what's misaligned, what survives, and what the fix-pass targets.

---

## Gap Analysis

### Infrastructure Misalignment

| Component | Swarm Built | x402 + thirdweb Requires | Gap Severity | Fix-Pass ID |
|---|---|---|---|---|
| Token in tests | MockERC20 (bare ERC-20) | Real ClankerToken (ERC20Permit + ERC20Burnable + ERC20Votes) | **Critical** — all 69 tests need token swap | FP-01 |
| Event source | Custom WebSocket listener | thirdweb Insight API + webhooks | **High** — cache invalidation rewrite | FP-02 |
| Chain reads | viem `createPublicClient` | thirdweb SDK `readContract` | **High** — Edge Functions rewrite | FP-03 |
| Time manipulation | Local Anvil forks | Tenderly Pro forks | **Medium** — test infra change | FP-04 |
| In-memory fallback | KV client has in-memory metrics | Zero in-memory state (thirdweb handles) | **Low** — monitoring cleanup | FP-05 |
| RPC provider | Alchemy direct | thirdweb RPC Edge (primary), Alchemy (fallback) | **Medium** — RPC rewire | FP-06 |

### What Survives (No Changes Needed)

- **KV schema design** — keys, TTLs, staleness proof logic
- **Migration spec + V2 contract + deprecation flow**
- **Safe runbook + ownership transfer procedures**
- **Doc structure** — claims → test mappings pattern
- **Test catalog** — test names and categories valid
- **QA audit findings (F-01 through F-20)** — still valid

### What Needs a Revision Pass

| Area | What Changes | Why |
|---|---|---|
| Cache invalidation engine | Rewrite event listener → thirdweb Insight webhooks | WebSocket listener replaced by webhook-driven invalidation |
| Edge Functions | Swap viem → thirdweb SDK readContract | thirdweb SDK handles RPC routing, retries, chain abstraction |
| Foundry test setUp() | Deploy ClankerToken instead of MockERC20 | Token interface mismatch |
| Integration tests | Run against Tenderly forks + real Sepolia tokens | Anvil forks don't support thirdweb's EIP-7702 facilitator flow |
| Replay script | Add Tenderly fork support | Time manipulation needs Tenderly Pro API |
| x402 payment middleware | New — doesn't exist yet | POST /pulse needs x402 settlePayment() wrapping |

---

## Fix-Pass Plan

### FP-01: Token Swap (Critical)
All 69 Foundry tests need MockERC20 → ClankerToken-equivalent with ERC20Permit + ERC20Burnable + ERC20Votes.

### FP-02: Cache Invalidation Rewrite (High)
Custom WebSocket listener → thirdweb Insight webhooks. KV schema unchanged, only trigger mechanism changes.

### FP-03: Edge Functions Rewrite (High)
viem createPublicClient → thirdweb SDK readContract. Shared thirdwebClient.ts module.

### FP-04: Test Infra — Anvil → Tenderly (Medium)
Foundry unit tests keep Anvil. Integration tests use Tenderly Pro forks.

### FP-05: Monitoring Cleanup (Low)
Remove in-memory fallback state. Surface errors instead of silently degrading.

### FP-06: RPC Rewire (Medium)
thirdweb RPC Edge primary, Alchemy fallback. Falls out naturally from FP-03.

---

## New Component: x402 Payment Layer

Net-new work depending on FP-01 + FP-03 + FP-06:
1. x402 middleware on POST /pulse using thirdweb settlePayment()
2. Agent-side fetchWithPayment via thirdweb SDK
3. payTo = dead address (0x...dEaD)
4. Facilitator configured with server wallet from thirdweb dashboard

---

## QA Audit Cross-Reference

Findings F-01 through F-20 remain valid. Post-realignment relevance increases for:
- Event delivery reliability (Insight webhooks vs WS)
- Token interface assumptions (permit/burn now exist)
- RPC latency (thirdweb RPC Edge vs direct Alchemy)
- Test determinism (Tenderly forks vs Anvil)
