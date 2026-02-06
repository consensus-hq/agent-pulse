# Feature Tracker — Agent Pulse Protocol

> Auto-maintained by daily Gemini analysis of session logs.
> Manual entries welcome. Last updated: 2026-02-06

---

## Feature Index

| # | Feature | Status | Priority | Est. Revenue | Success % |
|---|---------|--------|----------|-------------|-----------|
| 1 | [The Graph + Chainlink Reputation](#1-the-graph--chainlink-reputation) | Planned | P1 | $5-25/day | 85% |
| 2 | [x402-Gated Paid API (8 endpoints)](#2-x402-gated-paid-api) | Built | P0 | $10-250/day | 90% |
| 3 | [pulse-filter SDK (Viral Wedge)](#3-pulse-filter-sdk) | Built | P0 | Indirect | 75% |
| 4 | [BurnWithFee Wrapper (1% Infrastructure Fee)](#4-burnwithfee-wrapper) | Deployed (Base Mainnet) | P0 | $0.10-10/day | 95% |
| 5 | [Peer Attestation System](#5-peer-attestation-system) | Deployed (Base Mainnet) | P1 | Indirect | 80% |
| 6 | [Inbox System (Job Gating)](#6-inbox-system) | Production | P0 | Indirect | 90% |
| 7 | [ERC-8004 Identity Badge](#7-erc-8004-identity-badge) | Built (read-only) | P1 | Indirect | 85% |
| 8 | [Free /alive Endpoint](#8-free-alive-endpoint) | Missing | P0-CRITICAL | Indirect (viral loop) | 95% |
| 9 | [Freshness-Based Dynamic Pricing](#9-freshness-based-dynamic-pricing) | Built (not wired) | P1 | +20% margin | 80% |
| 10 | [Bundled Queries (3 bundles)](#10-bundled-queries) | Built | P1 | +15% of API rev | 85% |

---

## 1. The Graph + Chainlink Reputation

| Field | Value |
|-------|-------|
| **Feature** | Replace mocked reputation data with real indexed data via The Graph subgraph + optional Chainlink Functions for on-chain percentile |
| **Vendors** | The Graph (subgraph hosting), Chainlink (Functions for on-chain compute) |
| **Time** | 2-3 weeks post-hackathon |
| **Description** | The composite reputation endpoint (`/api/v2/agent/{addr}/reputation`) currently uses mocked percentile (85.4) and synthetic 30-day history. A subgraph indexing PeerAttestation events provides real aggregate data. Chainlink Functions can compute percentile off-chain and post on-chain for smart contract gating. |
| **Requirements** | - PeerAttestation deployed (✅ Mainnet `0x930dC613...`) - Event signatures verified Graph-compatible (✅ attester, subject, weight, timestamp all present) - Subgraph schema + mappings - Chainlink Functions subscription on Base - API endpoint swap (same response schema) |
| **Goal** | Real reputation scores backed by indexed on-chain attestation data. Enable smart contract gating on reputation (e.g., "only route to agents with reputation > 70"). |
| **Predicted Revenue Production** | $5-25/day additional from reputation endpoint queries becoming genuinely useful (currently mocked data limits adoption). Enables premium "Risk Bundle" at $0.04/call. |
| **Predicted Chance of Success** | 85% — architecture is already layered correctly, no rewrites needed. Risk: subgraph indexing latency or Chainlink Functions cost/reliability. |
| **GTM Documents** | `docs/POST_HACKATHON_ROADMAP.md`, `docs/API_V2.md` (reputation endpoint spec) |

---

## 2. x402-Gated Paid API

| Field | Value |
|-------|-------|
| **Feature** | 8 individual x402 payment-gated endpoints selling derivative liveness intelligence |
| **Vendors** | Thirdweb (x402 facilitator, server wallet), Vercel (hosting), Base (settlement) |
| **Time** | Built — hackathon deliverable |
| **Description** | External agents pay USDC per-call to access reliability scores, streak analysis, burn history, peer correlation, predictive insights, uptime metrics, liveness proofs, and global network stats. Thirdweb facilitator handles payment settlement on Base. |
| **Requirements** | - Thirdweb secret key + server wallet (✅) - Vercel deployment (✅) - Indexer feeding real data to endpoints (⚠️ partially mocked) - Base Mainnet (production) |
| **Goal** | Primary revenue stream. Breakeven at ~200 agents. 86% margins at 5,000 agents. |
| **Predicted Revenue Production** | $10/day at 200 agents → $250/day at 5,000 agents |
| **Predicted Chance of Success** | 90% — built and functional. Risk: adoption speed, x402 client ecosystem maturity. |
| **GTM Documents** | `docs/API_V2.md`, `docs/DUAL_X402_ECONOMY.md`, `README.md` |

---

## 3. pulse-filter SDK

| Field | Value |
|-------|-------|
| **Feature** | Open-source npm middleware (`@agent-pulse/middleware`) for agent routers to filter dead agents |
| **Vendors** | npm (package hosting) |
| **Time** | Built — hackathon deliverable |
| **Description** | The viral wedge. Routers drop in one line: `filterAlive(agents, { threshold: '24h' })`. Free calls hit `/alive` (no payment). Paid calls (reliability, uptime) auto-trigger x402. Integrations: LangChain, AutoGen, ElizaOS. |
| **Requirements** | - Free `/alive` endpoint (⚠️ NOT YET BUILT) - npm publish - Framework integration examples |
| **Goal** | Network effect: routers adopt → workers forced to pulse → more data → better signals → more paid queries. |
| **Predicted Revenue Production** | Indirect — drives paid API adoption. Every router that adopts forces N workers to integrate. |
| **Predicted Chance of Success** | 75% — package exists, concept is strong. Risk: chicken-and-egg (need routers AND workers simultaneously). |
| **GTM Documents** | `docs/SDK_QUICKSTART.md`, `README.md` (Missing Link viral loop) |

---

## 4. BurnWithFee Wrapper

| Field | Value |
|-------|-------|
| **Feature** | 1% infrastructure fee on PULSE burns via wrapper contract |
| **Vendors** | None (self-deployed Solidity) |
| **Time** | Built + deployed to Base Mainnet |
| **Description** | Wrapper contract: 1% to fee wallet, 99% to burn address. Configurable fee rate (100-500 bps). Minimum burn: 100 tokens. Fee wallet PULSE periodically swapped to USDC for ops funding. |
| **Requirements** | - Contract deployed (✅ Mainnet `0xd38cC332...`) - Frontend burn button calls wrapper (⚠️ needs wiring) - User approval flow (`approve(wrapperAddress, amount)`) - Mainnet deployment |
| **Goal** | Secondary revenue stream. Fund infrastructure (Vercel, RPC, HeyElsa DeFi panel). |
| **Predicted Revenue Production** | $0.10/day (pessimistic) to $10/day (optimistic) depending on burn volume. |
| **Predicted Chance of Success** | 95% — contract built, tested (33/33), deployed. Minimal risk. |
| **GTM Documents** | `docs/DUAL_X402_ECONOMY.md`, `docs/DEPLOYMENT_RUNBOOK.md` |

---

## 5. Peer Attestation System

| Field | Value |
|-------|-------|
| **Feature** | On-chain peer-to-peer reputation via weighted attestations |
| **Vendors** | None (self-deployed Solidity) |
| **Time** | Built + deployed to Base Mainnet |
| **Description** | Agents vouch for each other with positive/negative weighted attestations. Epoch-based rate limiting. Feeds into composite reputation score. |
| **Requirements** | - Contract deployed (✅ Mainnet `0x930dC613...`) - API endpoints built (✅ `/attest`, `/attestations`) - SDK integration (✅ `attestation.ts`) - The Graph indexing (planned post-hackathon) |
| **Goal** | Decentralized trust layer. Agents with peer vouches rank higher in routing decisions. |
| **Predicted Revenue Production** | Indirect — increases value of reputation endpoint ($0.01/call) and Risk Bundle ($0.04/call). |
| **Predicted Chance of Success** | 80% — contract + API built. Risk: bootstrapping initial attestation network. |
| **GTM Documents** | `docs/POST_HACKATHON_ROADMAP.md`, `docs/API_V2.md` |

---

## 6. Inbox System

| Field | Value |
|-------|-------|
| **Feature** | Job inbox gated by liveness — only alive agents receive tasks |
| **Vendors** | Vercel KV (persistent storage) |
| **Time** | Production-ready |
| **Description** | `/api/inbox/{wallet}` unlocks with short-lived key. `isAlive()` gating, 1-hour TTL, 5 req/hr rate limit. Persistent Vercel KV storage. |
| **Requirements** | All met ✅ |
| **Goal** | Demonstrate pulse = capability. Locked inbox until agent proves liveness. |
| **Predicted Revenue Production** | Indirect — demonstrates protocol utility for hackathon judges. |
| **Predicted Chance of Success** | 90% — production-ready, audited. |
| **GTM Documents** | `docs/CLAWDKITCHEN_HACKATHON.md` |

---

## 7. ERC-8004 Identity Badge

| Field | Value |
|-------|-------|
| **Feature** | Read-only integration with ERC-8004 identity + reputation registries on Base |
| **Vendors** | ERC-8004 registries (external, Base mainnet) |
| **Time** | Built |
| **Description** | `useErc8004` hook checks identity registry (`balanceOf > 0` = verified). `Erc8004Panel` renders badge + CTA. Read-only — no writes needed for MVP. |
| **Requirements** | - Hook built (✅) - Panel built (✅) - Registry addresses in env (✅) |
| **Goal** | Composability signal for hackathon judges. Shows Pulse integrates with emerging standards. |
| **Predicted Revenue Production** | Indirect — hackathon scoring, ecosystem credibility. |
| **Predicted Chance of Success** | 85% — built and working. Risk: ERC-8004 adoption is early. |
| **GTM Documents** | `docs/CLAWDKITCHEN_HACKATHON.md` |

---

## 8. Free /alive Endpoint

| Field | Value |
|-------|-------|
| **Feature** | Free, ungated `GET /v2/agent/{addr}/alive` endpoint |
| **Vendors** | None |
| **Time** | NOT YET BUILT — ~30 minutes |
| **Description** | Returns `{ alive: bool, lastPulse: timestamp }`. No x402 payment. 60/min rate limit. This is the foundation of the entire viral loop — routers need this free to adopt pulse-filter. |
| **Requirements** | - Route file (`apps/web/src/app/api/v2/agent/[address]/alive/route.ts`) - Skip x402 gate - Rate limit (60/min IP, 1000/day) |
| **Goal** | THE viral hook. Without this, pulse-filter can't work, routers won't adopt, viral loop breaks. |
| **Predicted Revenue Production** | $0 direct — but enables ALL other revenue by driving adoption. |
| **Predicted Chance of Success** | 95% — trivial to build. Risk: none. |
| **GTM Documents** | `docs/API_V2.md`, `README.md` |

---

## 9. Freshness-Based Dynamic Pricing

| Field | Value |
|-------|-------|
| **Feature** | Cache-aware pricing: 1.5x for real-time, 0.5x for cached responses |
| **Vendors** | Thirdweb x402 (supports `upto` scheme for variable pricing) |
| **Time** | `pricing.ts` built, not fully wired into x402-gate |
| **Description** | `calculatePrice()` function exists with correct logic. Needs wiring into the x402 gate middleware so cached responses charge 0.5x and cache misses charge 1.5x. |
| **Requirements** | - `pricing.ts` (✅) - Wire into `x402-gate.ts` freshness check (⚠️ partial) - Thirdweb `upto` scheme verification |
| **Goal** | Discourage spam while rewarding agents that accept stale data. Increase margins on cached responses. |
| **Predicted Revenue Production** | +20% margin improvement on paid queries (most queries hit cache). |
| **Predicted Chance of Success** | 80% — logic exists. Risk: thirdweb `upto` scheme behavior in practice. |
| **GTM Documents** | `docs/API_V2.md` (freshness pricing section) |

---

## 10. Bundled Queries

| Field | Value |
|-------|-------|
| **Feature** | 3 bundled query endpoints at ~20% discount vs individual calls |
| **Vendors** | Same as paid API |
| **Time** | Built |
| **Description** | Router Bundle (reliability+liveness+uptime = $0.02), Fleet Bundle (batch 10 agents = $0.15), Risk Bundle (peer-correlation+predictive+streak = $0.04). Named differently in code (reliability-portfolio, uptime-health, peer-graph) vs spec. |
| **Requirements** | - Routes built (✅) - Naming alignment with v4 spec (⚠️ mismatch) |
| **Goal** | Increase average transaction value. Routers making routing decisions need multiple signals per call. |
| **Predicted Revenue Production** | +15% of API revenue from bundle adoption. |
| **Predicted Chance of Success** | 85% — built and functional. Risk: discovery (do users find bundles?). |
| **GTM Documents** | `docs/API_V2.md` (bundled queries section) |

---

## Changelog

| Date | Change | Source |
|------|--------|--------|
| 2026-02-06 | Initial tracker created with 10 features | Manual + session analysis |
