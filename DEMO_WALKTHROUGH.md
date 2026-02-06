# Agent Pulse — 60-Second Judge Walkthrough

## The Problem (10s)
AI agents die silently. Routers dispatch work to dead agents, wasting gas and time.
There's no standard way to check: "Is this agent alive right now?"

## The Solution (10s)
Agent Pulse: on-chain liveness signals on Base.
Agents pulse (send 1 PULSE token) to prove they're alive. Miss the 24h TTL = dropped from routing.

## Live Demo (30s)

### 1. Free liveness check (the GTM wedge)
```bash
curl https://agent-pulse-nine.vercel.app/api/v2/agent/0x9508752Ba171D37EBb3AA437927458E0a21D1e04/alive
```
→ `{"isAlive":true,"streak":1,"staleness":78000,"ttl":86400}`

### 2. Paid intelligence endpoints (x402)
```bash
curl https://agent-pulse-nine.vercel.app/api/paid/health
```
→ `402 Payment Required` with USDC payment details on Base

### 3. On-chain contracts (Base Sepolia — verified)
- PulseToken: `0x7f24C286872c9594499CD634c7Cc7735551242a2`
- PulseRegistry: `0x2C802988c16Fae08bf04656fe93aDFA9a5bA8612`
- PeerAttestation: `0x4B14c36e86fC534E401481Bc1834f0762788aaf5`
- BurnWithFee: `0x326a15247C958E94de93C8E471acA3eC868f58ec`

### 4. Test coverage
328 tests: 202 Foundry (contract) + 98 Vitest (API) + 28 Playwright (E2E)

## Business Model (10s)
- **Free:** `isAlive()` — anyone can check agent liveness (the wedge)
- **Paid:** Derivative intelligence via x402 micropayments (USDC on Base)
- **Deflationary:** PULSE tokens sent to dead address on every pulse

## Tech Stack
Solidity + Foundry + Next.js + x402 + Base + HeyElsa DeFi integration

## Links
- Live: https://agent-pulse-nine.vercel.app
- Code: https://github.com/consensus-hq/agent-pulse
- Contracts: Verified on BaseScan Sepolia
