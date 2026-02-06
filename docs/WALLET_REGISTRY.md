# WALLET_REGISTRY.md — Agent Pulse Wallet Registry & Revenue Model

⛔ **CONFIDENTIAL — INTERNAL USE ONLY** ⛔

This document contains sensitive financial infrastructure details. Never share wallet addresses, private key storage methods, or signer configurations externally.

---

## Table of Contents

1. [Wallet Registry](#1-wallet-registry)
2. [Server Wallet Architecture Decision](#2-server-wallet-architecture-decision)
3. [PULSE Fee Wallet Recommendation](#3-pulse-fee-wallet-recommendation)
4. [Revenue Projections](#4-revenue-projections)
5. [Break-Even Analysis](#5-break-even-analysis)
6. [Cash Flow Summary](#6-cash-flow-summary)

---

## 1. Wallet Registry

### 1.1 Deployer EOA (Contract Ownership)

| Field | Value |
|-------|-------|
| **Address** | `0x9508752Ba171D37EBb3AA437927458E0a21D1e04` |
| **Purpose** | Contract deployment, ownership, admin functions |
| **Networks** | Base Mainnet, Base Sepolia |
| **Holds** | ETH (gas), may accumulate fees |
| **Current Balance** | ~0.0019 ETH (~$5.00) |
| **Risk Level** | **CRITICAL** — owns all contracts, can upgrade/destroy |
| **Access Method** | 1Password vault `Connie-Automation`, server-side only |
| **Signer** | Connie (hardware-secured) |

**Responsibilities:**
- Deploy new contracts
- Transfer contract ownership to Treasury Safe
- Emergency pause/unpause
- Receive protocol fees (temporary, swept to Treasury)

---

### 1.2 HeyElsa Hot Wallet (Outgoing Payments)

| Field | Value |
|-------|-------|
| **Address** | `0xDb48A285a559F61EF3B3AFbc7ef5D7Ce9FAAAcd6` |
| **Purpose** | Pay HeyElsa for DeFi data via x402 micropayments |
| **Networks** | Base Mainnet |
| **Holds** | USDC (operational float) |
| **Current Balance** | $2.50 USDC |
| **Risk Level** | **LOW** — small balance, no ownership, replaceable |
| **Access Method** | Vercel env `HEYELSA_PAYMENT_KEY` (encrypted) |
| **Signer** | Serverless function (Node.js + viem) |

**Responsibilities:**
- Sign EIP-3009 transfers to HeyElsa
- Pay $0.01/portfolio, $0.002/price, $0.005/balance calls
- Auto-replenished from Treasury when low

---

### 1.3 Treasury Safe (Protocol Treasury)

| Field | Value |
|-------|-------|
| **Address** | `0xA7940a42c30A7F492Ed578F3aC728c2929103E43` |
| **Purpose** | Protocol fee accumulation, governance, long-term holdings |
| **Networks** | Base Mainnet |
| **Type** | Gnosis Safe Multisig |
| **Signers** | Deployer EOA + Romy (2 hardware wallets) |
| **Threshold** | 2-of-2 (Romy must approve all transactions) |
| **Risk Level** | **LOW** — multisig with hardware wallet requirement |
| **Access Method** | Gnosis Safe UI + hardware wallet signing |

**Responsibilities:**
- Final destination for all protocol fees
- Governance token distributions
- Major contract upgrades (after ownership transfer)
- Fund hot wallets as needed

---

### 1.4 Thirdweb Server Wallet (Incoming Revenue)

| Field | Value |
|-------|-------|
| **Address** | `0xdf42EC5803518b251236146289B311C39EDB0cEF` |
| **Purpose** | Receive x402 API payments from external agents |
| **Networks** | Base Mainnet |
| **Holds** | USDC (revenue from API calls) |
| **Current Balance** | $0.00 (new) |
| **Risk Level** | **MEDIUM** — receives revenue, requires sweep to Treasury |
| **Access Method** | Thirdweb dashboard + server-side SDK |
| **Signer** | Thirdweb managed key (AWS KMS) |

**Responsibilities:**
- Accept USDC payments via x402 protocol
- Hold accumulated API revenue
- Periodic sweep to Treasury Safe

---

### 1.5 PULSE Fee Wallet (NEW — Burn Fee Capture)

| Field | Value |
|-------|-------|
| **Address** | *TBD — recommend NEW EOA* |
| **Purpose** | Capture 1% fee from PULSE token burns |
| **Networks** | Base Mainnet |
| **Holds** | PULSE tokens (later swapped to USDC) |
| **Risk Level** | **MEDIUM** — accumulates value, swept frequently |
| **Access Method** | 1Password or secure key management |
| **Signer** | Automated sweeper + manual override |

**Responsibilities:**
- Receive 1% of all PULSE burn amounts
- Accumulate until swap threshold
- Swap PULSE → USDC via DEX
- Transfer USDC to HeyElsa Hot Wallet for payments

---

## 2. Server Wallet Architecture Decision

### The Question

Should the **Thirdweb Server Wallet** (`0xdf42...`) be the same as the **HeyElsa Hot Wallet** (`0xDb48...`)?

### Recommendation: SEPARATE (with nuance)

| Scenario | Recommendation | Rationale |
|----------|---------------|-----------|
| **Hackathon / MVP** | **SAME wallet** acceptable | Simplicity, faster demo, single balance to monitor |
| **Production / Post-launch** | **SEPARATE wallets** required | Audit trail, risk isolation, accounting clarity |

### Hackathon Justification (SAME)

For the Clawdkitchen submission:

```
Single Wallet: 0xDb48A285a559F61EF3B3AFbc7ef5D7Ce9FAAAcd6
├── Receives: x402 API revenue from external agents
├── Pays: HeyElsa for DeFi data
└── Net: Revenue - Cost = Profit (or loss if unprofitable)
```

**Pros:**
- One wallet to fund ($2.50 covers both needs)
- Simpler mental model for judges
- Single environment variable
- No sweep transactions needed

**Cons:**
- No separation between revenue streams
- Harder to attribute profit/loss per stream
- If compromised, lose both revenue and payment ability

### Production Justification (SEPARATE)

```
Thirdweb Server Wallet (0xdf42...)
├── Receives: x402 API revenue from external agents
├── Periodic sweep: → Treasury Safe
└── Accounting: Revenue tracking, gross receipts

HeyElsa Hot Wallet (0xDb48...)
├── Receives: Funding from Treasury
├── Pays: HeyElsa for DeFi data
└── Accounting: Operating expense, COGS
```

**Pros:**
- Clear revenue vs. expense separation
- Treasury sees gross revenue before costs
- HeyElsa wallet can be cycled without affecting revenue collection
- Better audit trail for taxes/accounting
- Revenue wallet can have stricter access controls

**Cons:**
- Two wallets to monitor and fund
- Requires sweep mechanism
- More complex infrastructure

### FLUX Recommendation

> **For Clawdkitchen:** Use the existing HeyElsa Hot Wallet (`0xDb48...`) as the x402 receiver. Document this as a simplification for the hackathon with a note that production would separate them.
>
> **Post-Hackathon:** Create a dedicated Thirdweb Server Wallet for API revenue. Sweep weekly to Treasury. Fund HeyElsa wallet from Treasury as an operating expense.

---

## 3. PULSE Fee Wallet Recommendation

### Purpose

When users burn PULSE tokens (transfer to dead address), a **1% fee** is captured to pay for the HeyElsa integration. This requires a dedicated wallet to receive the fee before swapping to USDC.

### Option A: NEW EOA (Recommended)

Create a fresh externally-owned account specifically for fee capture.

**Address:** Generate new via `viem` or `cast wallet new`

**Pros:**
- Clean separation from deployer
- Can set specific alerting/monitoring
- If compromised, only loses accumulated fees (not contract ownership)
- Easy to rotate

**Cons:**
- Another key to manage
- Requires funding with ETH for swaps

### Option B: Deployer EOA (Acceptable for MVP)

Use the existing deployer wallet (`0x9508...`) to receive fees.

**Pros:**
- No new key generation
- Already has ETH for gas
- One less wallet to track

**Cons:**
- Mixes deployment/ownership with revenue
- Higher risk — if deployer compromised, lose everything
- Harder to audit fee-specific flows

### FLUX Recommendation

> **Use a NEW EOA** for the PULSE Fee Wallet. The security benefits outweigh the minor key management overhead. 
>
> **Setup:**
> 1. Generate new address via `cast wallet new`
> 2. Store in 1Password as `PULSE Fee Wallet`
> 3. Configure burn contract to send 1% fees to this address
> 4. Set up automated sweeper (weekly) to swap PULSE → USDC → HeyElsa Hot Wallet
> 5. Fund with $1 ETH for swap gas

---

## 4. Revenue Projections

### Stream A: PULSE Burn Fees (1% Capture)

Assumptions:
- Average burn amount: $5 (moderate), $2 (pessimistic), $20 (optimistic)
- Fee rate: 1% of burn value
- PULSE/USD conversion: 1:1 for simplicity (actual varies)

| Scenario | Daily Burns | Avg Burn | Daily Fee | Monthly Fee | Annual Fee |
|----------|-------------|----------|-----------|-------------|------------|
| **Pessimistic** | 10 | $2.00 | $0.20 | $6.00 | $73.00 |
| **Moderate** | 100 | $5.00 | $5.00 | $150.00 | $1,825.00 |
| **Optimistic** | 500 | $20.00 | $100.00 | $3,000.00 | $36,500.00 |

### Stream B: x402 API Revenue

Assumptions:
- Pricing: $0.02/portfolio call (50% margin over $0.01 HeyElsa cost)
- Cache hit rate: 40% (reduces HeyElsa costs)
- Effective HeyElsa cost: $0.006/call (after cache savings)

| Scenario | Daily Calls | Gross Revenue | HeyElsa Cost | Net Revenue | Monthly Net | Annual Net |
|----------|-------------|---------------|--------------|-------------|-------------|------------|
| **Pessimistic** | 50 | $1.00 | $0.30 | $0.70 | $21.00 | $255.50 |
| **Moderate** | 500 | $10.00 | $3.00 | $7.00 | $210.00 | $2,555.00 |
| **Optimistic** | 5,000 | $100.00 | $30.00 | $70.00 | $2,100.00 | $25,550.00 |

### Combined Revenue Model

| Scenario | Stream A (Burns) | Stream B (API) | Total Monthly | Total Annual |
|----------|------------------|----------------|---------------|--------------|
| **Pessimistic** | $6.00 | $21.00 | $27.00 | $328.50 |
| **Moderate** | $150.00 | $210.00 | $360.00 | $4,380.00 |
| **Optimistic** | $3,000.00 | $2,100.00 | $5,100.00 | $62,050.00 |

---

## 5. Break-Even Analysis

### Stream A: Burn Fees

**Fixed Costs to Cover:**
- HeyElsa base integration: ~$50/month (approximate)
- Gas for swap operations: ~$10/month
- **Total:** ~$60/month

| Scenario | Daily Burns Needed | Avg Burn Amount | Break-Even Days |
|----------|-------------------|-----------------|-----------------|
| Pessimistic ($2 avg) | 300 burns | $2.00 | N/A (unsustainable) |
| Moderate ($5 avg) | 120 burns | $5.00 | ~12 days |
| Optimistic ($20 avg) | 30 burns | $20.00 | ~3 days |

> **Insight:** Burn fees alone only work at scale with larger average burn amounts. At low burn values, this stream is subsidized by Stream B.

### Stream B: x402 API Calls

**Fixed Costs to Cover:**
- HeyElsa API costs: Variable per call
- Infrastructure (Vercel): $20/month
- Thirdweb fees: ~1% of revenue
- **Total Fixed:** ~$25/month

| Pricing Tier | Break-Even Calls/Day | Break-Even Monthly |
|--------------|---------------------|-------------------|
| $0.02/portfolio (current) | ~42 calls | 1,260 calls |
| $0.015/portfolio (promo) | ~56 calls | 1,680 calls |
| $0.03/portfolio (premium) | ~28 calls | 840 calls |

> **Insight:** At $0.02/call, Stream B is profitable with just ~42 daily calls. This is the primary revenue driver at low-to-medium scale.

### Combined Break-Even

| Scenario | Monthly Cost | Monthly Revenue | Net | Status |
|----------|--------------|-----------------|-----|--------|
| Pessimistic | $85 | $27 | -$58 | 🔴 Subsidized |
| Moderate | $85 | $360 | +$275 | 🟢 Profitable |
| Optimistic | $200 | $5,100 | +$4,900 | 🟢 Highly Profitable |

**Break-Even Point:** ~150 combined daily burns + API calls at moderate pricing

---

## 6. Cash Flow Summary

### Current State (Day 0)

| Wallet | Asset | Balance | Purpose |
|--------|-------|---------|---------|
| Deployer | ETH | $5.00 | Gas, contract ownership |
| HeyElsa | USDC | $2.50 | Pay for DeFi data |
| Treasury | — | $0.00 | Long-term holdings |
| Server | USDC | $0.00 | API revenue (hackathon: use HeyElsa) |
| PULSE Fee | — | — | TBD — create new EOA |

### Recommended Initial Funding

| Wallet | Amount | Asset | Source |
|--------|--------|-------|--------|
| Deployer | $10 | ETH | Romy (already in progress) |
| HeyElsa | $25 | USDC | Treasury (post-hackathon) |
| PULSE Fee | $5 | ETH | Deployer (swap gas) |
| Treasury | $50 | USDC | Romy (seed funding) |

**Total Seed Capital Required:** ~$90

### Automated Flow (Post-Hackathon)

```
┌─────────────────────────────────────────────────────────────────┐
│                        REVENUE FLOWS                            │
└─────────────────────────────────────────────────────────────────┘

  ┌──────────────┐         ┌──────────────┐
  │  PULSE Fee   │         │   Server     │
  │   Wallet     │         │   Wallet     │
  │  (NEW EOA)   │         │ (Thirdweb)   │
  └──────┬───────┘         └──────┬───────┘
         │                        │
         │ 1% burn fees           │ API payments
         │ (PULSE tokens)         │ (USDC)
         ▼                        ▼
  ┌──────────────────────────────────────┐
  │         Swap PULSE → USDC            │
  │      (Automated via DEX aggregator)   │
  └──────────────────┬───────────────────┘
                     │
                     ▼
            ┌────────────────┐
            │  HeyElsa Hot   │
            │    Wallet      │
            │  (Operational) │
            └────────┬───────┘
                     │
                     │ x402 payments
                     ▼
            ┌────────────────┐
            │    HeyElsa     │
            │     API        │
            └────────────────┘
                     ▲
                     │
                     │ Revenue sweep
                     │ (weekly)
            ┌────────┴───────┐
            │  Treasury Safe │
            │  (Multisig)    │
            │ (Final holding)│
            └────────────────┘
```

### Monthly Cash Flow Targets

| Metric | Target | Notes |
|--------|--------|-------|
| Gross Revenue | $500/month | Moderate scenario baseline |
| Operating Costs | $100/month | HeyElsa + infrastructure |
| Net Profit | $400/month | 80% margin before labor |
| Treasury Sweep | Weekly | Move excess to Safe |
| Hot Wallet Top-Up | As needed | Maintain $25 float |

---

## Appendix: Risk Matrix

| Wallet | Theft Risk | Loss Risk | Operational Risk | Mitigation |
|--------|-----------|-----------|------------------|------------|
| Deployer | HIGH (owns all) | HIGH | LOW | Hardware wallet, 1Password, never expose |
| HeyElsa | LOW (small balance) | LOW | MEDIUM | Limited funds, easy to rotate |
| Treasury | LOW (multisig) | LOW | LOW | 2-of-2 multisig, hardware wallets |
| Server | MEDIUM | LOW | MEDIUM | Thirdweb KMS, regular sweeps |
| PULSE Fee | MEDIUM | LOW | MEDIUM | Automated sweeps, limited exposure |

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-02-06 | FLUX | Initial registry + revenue model |

---

*End of Document*
