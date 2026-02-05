# Agent Pulse — x402 Micropayment Integration

## Feature Overview

Integrate the x402 HTTP-native payment protocol into Agent Pulse's pulse submission flow, requiring agents to pay a micropayment in **Pulse tokens** when proving liveness. This adds an economic cost layer to the existing anti-spam mechanism, making Sybil attacks and fake pulse streaks significantly more expensive.

## How It Fits Into Agent Pulse

**Current flow (without x402):**

1. Agent holds Pulse tokens (launched via Clanker on Base)
2. Agent sends Pulse to burn sink → proves liveness
3. Registry updates streak counter
4. ERC-8004 reputation update if agent is considered alive

**New flow (with x402):**

1. Agent calls `POST /pulse` endpoint
2. Server responds with `402 Payment Required` + payment details (amount, token, network)
3. Agent's wallet signs an EIP-712 typed data payload authorizing Pulse token transfer
4. Agent retries request with `PAYMENT-SIGNATURE` header
5. Facilitator verifies signature, settles payment on-chain (Pulse transferred to burn address)
6. Server confirms payment → triggers on-chain Pulse burn + streak update
7. ERC-8004 reputation update proceeds as normal

## Why x402 + Agent Pulse

- **Stronger anti-spam:** Every pulse costs real economic value (micropayment + token burn), not just gas fees
- **Native agent compatibility:** x402 is designed for autonomous agent-to-service payments — no human intervention needed
- **No smart contracts required from us:** The facilitator handles all on-chain settlement, gas, and transaction broadcasting
- **Pulse token compatibility:** Clanker-launched tokens include ERC-2612 `permit()` by default, making them directly compatible with x402's permit-based payment flow
- **Narrative alignment:** Combines two emerging standards (x402 + ERC-8004) into a single anti-spam + reputation system for autonomous agents

## Technical Specification

### Token Details

| Property | Value |
|---|---|
| Token | Pulse (Clanker-launched ERC-20) |
| Permit Support | ERC-2612 (included by default via Clanker's ClankerToken template) |
| Chain | Base (EVM) |
| Burn Method | Transfer to dead address (0x000...dEaD) |

### x402 Configuration

| Property | Value |
|---|---|
| Protected Endpoint | `POST /pulse` |
| Payment Token | Pulse (not USDC) |
| Facilitator | Thirdweb x402 facilitator (supports arbitrary ERC-20 with permit) |
| Network | Base mainnet (eip155:8453) / Base Sepolia (eip155:84532) for testnet |
| Payment Scheme | exact |
| Price Per Pulse | Configurable (e.g., 1-10 Pulse tokens per submission) |

### Burn Strategy

**Option A — Dead address as payTo (simplest, recommended for hackathon):**
Set payTo to 0x000000000000000000000000000000000000dEaD. The facilitator transfers Pulse there on settlement. Tokens are permanently removed from circulation. No extra contract calls needed.

## Integration Steps

### 1. Protect the Pulse Endpoint with x402 Middleware (Next.js)

Using @x402/next for our Next.js app.

### 2. Agent-Side Payment Flow

When an agent calls POST /pulse:
1. Receives 402 Payment Required response with payment header details
2. Parses required amount, token address, and facilitator info
3. Signs an EIP-712 typed data payload authorizing the Pulse token transfer
4. Retries the request with PAYMENT-SIGNATURE header attached
5. Facilitator verifies signature → calls permit() + transferFrom() on-chain → Pulse moves to burn address
6. Server receives confirmation → proceeds with streak update + ERC-8004 reputation

### 3. Post-Payment Logic (Server Side)

Payment confirmed → Update streak in registry → Check streak threshold → If alive: trigger ERC-8004 reputation update

## Testnet Setup (For Hackathon Demo)

| Step | Details |
|---|---|
| 1. Deploy Pulse via Clanker or forge | Launch on Base Sepolia |
| 2. Fund agent wallets | Mint/transfer test Pulse tokens to agent wallets |
| 3. Configure facilitator | Use thirdweb testnet facilitator URL |
| 4. Set network to Base Sepolia | eip155:84532 |
| 5. Test the loop | Agent calls /pulse → 402 → signs → pays Pulse → burn → streak update |

## Key Dependencies

- @x402/next (v2.2.0) — Next.js middleware
- @x402/core (v2.2.0) — Core protocol types/utils
- thirdweb (v5.118.1) — SDK + facilitator
- viem — Already installed, EIP-712 signing

## Source

Spec provided by Romy (2026-02-05). Design decisions are authoritative.
