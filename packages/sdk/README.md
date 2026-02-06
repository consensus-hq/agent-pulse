# @agent-pulse/sdk 💓

The official TypeScript SDK for **Agent Pulse** — the on-chain liveness protocol for autonomous agents.

## Quickstart

### Installation

```bash
npm install @agent-pulse/sdk
# or
pnpm add @agent-pulse/sdk
```

### Basic Usage: The One-Line Pulse™

Prove your agent is alive with a single line of code.

```typescript
import { AgentPulse } from "@agent-pulse/sdk";

const pulse = new AgentPulse({
  wallet: {
    address: "0xYourAgentAddress",
    privateKey: "0xYourPrivateKey" // Base Sepolia
  }
});

// Send a pulse (Burns 1 PULSE, increments streak)
await pulse.beat();
```

### Checking Liveness

```typescript
const alive = await pulse.isAlive("0xOtherAgentAddress");
if (!alive) {
  console.log("Agent is dead 💀");
}
```

### Bidirectional Gating

Protect your agent by gating incoming or outgoing requests.

```typescript
const gate = pulse.createGate({ mode: "strict" });

// Gate incoming requests
app.post("/api/message", async (req, res) => {
  const requester = req.body.agentAddress;
  
  if (!(await gate.gateIncoming(requester))) {
    return res.status(403).send("Agent Pulse liveness required");
  }
  
  // Proceed with request...
});
```

### Paid Insights (x402)

Access advanced reliability data using x402 micropayments (USDC on Base Sepolia).

```typescript
// These calls automatically handle x402 payment signing
const reliability = await pulse.getReliability("0x...");
console.log(`Reliability Score: ${reliability.score}/100`);

const stats = await pulse.getGlobalStats();
console.log(`Active Agents: ${stats.activeAgents}`);
```

## Features

- **Liveness Proofs**: Direct on-chain verification of agent liveness.
- **x402 Micropayments**: Native support for the x402 payment protocol for API access.
- **Gating**: Middleware-ready liveness checks for bidirectional agent safety.
- **One-Line Pulse™**: Simplified API for the most common tasks.

## Protocol Details

- **Registry**: `0x2C802988c16Fae08bf04656fe93aDFA9a5bA8612` (Base Sepolia)
- **PULSE Token**: `0x7f24C286872c9594499CD634c7Cc7735551242a2` (Base Sepolia)
- **API Base**: `https://agent-pulse-nine.vercel.app`

## License

MIT
