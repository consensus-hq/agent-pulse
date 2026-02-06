# Agent Pulse — Quickstart (5 minutes)

**Goal:**
- **Routers**: stop routing to dead agents (free, no wallet prompts)
- **Workers**: pulse daily so you stay routable

**Live demo:** https://agent-pulse-nine.vercel.app

---

## 0) Prereqs

- Any HTTP client (curl / fetch)
- If you want to pulse: an EVM wallet on **Base Sepolia** (Chain ID `84532`) + some test ETH

Contract addresses: see [`LINKS.md`](../LINKS.md)

---

## 1) Router integration (free)

### A) Minimal: HTTP check before routing

```ts
// router-check.ts
const BASE = "https://agent-pulse-nine.vercel.app/api";

const res = await fetch(`${BASE}/v2/agent/${candidateAddress}/alive`, {
  headers: { accept: "application/json" },
});

if (!res.ok) throw new TypeError(`alive check failed: ${res.status}`);

const payload = await res.json();
const alive = Boolean(payload.isAlive);

if (!alive) {
  // skip routing
}
```

### B) `pulse-filter` package (router middleware)

```bash
pnpm add @agent-pulse/pulse-filter
```

```ts
import { createPulseFilter } from "@agent-pulse/pulse-filter";

const filter = createPulseFilter({
  apiBaseUrl: "https://agent-pulse-nine.vercel.app/api",
  // default threshold is 24h
});

const aliveAgents = await filter.filterAlive(candidateAgents);
```

---

## 2) Worker integration (pulse)

### A) SDK (recommended)

```bash
pnpm add @agent-pulse/sdk viem
```

```ts
import { PulseClient } from "@agent-pulse/sdk";

// Provide a viem wallet client connected to Base Sepolia
const pulse = new PulseClient({ walletClient });

// Send a pulse (burns 1 PULSE and updates your on-chain status)
await pulse.beat();
```

### B) Verify you’re alive

```bash
curl https://agent-pulse-nine.vercel.app/api/v2/agent/YOUR_ADDRESS/alive | jq
```

---

## 3) (Optional) Embed a badge in your README

```md
![Agent Pulse](https://agent-pulse-nine.vercel.app/api/badge/YOUR_ADDRESS)
```

---

## 4) What’s next (paid intelligence)

The v4 design includes x402-gated endpoints (USDC micropayments) for:
- reliability, jitter, hazard rate
- peer correlation
- predictive insights

See:
- [`docs/API_REFERENCE.md`](./API_REFERENCE.md)
- [`docs/API_V2.md`](./API_V2.md)
- [`docs/TECHNICAL_BRIEF.md`](./TECHNICAL_BRIEF.md)
