# Agent Pulse SDK Quickstart

---

## pulse-filter — The Wedge (For Routers)

The fastest way to integrate. Free, open-source middleware that makes dead agents invisible.

```bash
npm install @agent-pulse/pulse-filter
```

### LangChain

```typescript
import { createPulseFilter } from '@agent-pulse/pulse-filter';

const filter = createPulseFilter({ threshold: '24h' });

// In your routing pipeline
const candidates = await registry.getAgents('copywriter');
const alive = await filter.filterAlive(candidates);
const best = alive.sort((a, b) => b.reliability - a.reliability)[0];
await dispatchJob(job, best);
```

### AutoGen

```typescript
import { createPulseFilter } from '@agent-pulse/pulse-filter';

const filter = createPulseFilter({ threshold: '24h', minStreak: 3 });

// Before assigning agents to group chat
const available = await filter.filterAlive(agentPool);
const groupChat = new GroupChat({ agents: available });
```

### ElizaOS

```typescript
import { createPulseFilter } from '@agent-pulse/pulse-filter';

// As an evaluator
const pulseEvaluator = {
  name: 'pulse-check',
  handler: async (runtime, message) => {
    const filter = createPulseFilter();
    const alive = await filter.isAlive(message.agentAddress);
    return alive ? 1.0 : 0.0;
  }
};
```

### Custom / Raw

```typescript
import { createPulseFilter } from '@agent-pulse/pulse-filter';

const filter = createPulseFilter({
  apiUrl: 'https://agent-pulse-nine.vercel.app',
  threshold: '24h',
  minStreak: 1,
});

// Single check
const alive = await filter.isAlive('0xAgentAddress...');

// Batch filter
const aliveAgents = await filter.filterAlive(['0x1...', '0x2...', '0x3...']);
```

**Cost:** $0. The free `/alive` endpoint is used. Routers pay nothing.

---

## @agent-pulse/sdk — Full SDK (For Workers & Analytics)

```bash
npm install @agent-pulse/sdk viem
```

### Start Pulsing (Worker Agent)

```typescript
import { PulseClient } from '@agent-pulse/sdk';
import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';

const walletClient = createWalletClient({
  account: privateKeyToAccount('0x...'),
  chain: baseSepolia,
  transport: http(),
});

const pulse = new PulseClient({ walletClient });

// Burn PULSE to prove liveness
await pulse.beat(); // Uses BurnWithFee wrapper

// Set up daily pulse
setInterval(() => pulse.beat(), 24 * 60 * 60 * 1000);
```

### Query Paid Endpoints

```typescript
const pulse = new PulseClient({
  walletClient, // Needed for x402 payments
  paymentConfig: {
    maxPrice: '0.05',     // Max USDC per call
    freshness: 'cached',  // Prefer 0.5x pricing
  },
});

// x402 payment handled automatically
const reliability = await pulse.getReliability('0xAgent...');
console.log(`Score: ${reliability.reliabilityScore}/100`);

const insights = await pulse.getPredictiveInsights('0xAgent...');
console.log(`Risk: ${insights.failureRisk}, Confidence: ${insights.confidence}`);

const peers = await pulse.getPeerCorrelation('0xAgent...');
console.log(`Correlated with ${peers.similarAgents.length} peers`);
```

### Bundled Queries

```typescript
// Router Bundle ($0.02) — reliability + liveness-proof + uptime
const router = await pulse.getRouterBundle('0xAgent...');

// Fleet Bundle ($0.15) — batch up to 10 agents
const fleet = await pulse.getFleetBundle(['0x1...', '0x2...', '0x3...']);

// Risk Bundle ($0.04) — correlation + predictive + streak
const risk = await pulse.getRiskBundle('0xAgent...');
```

### Error Handling

```typescript
import { PaymentError, RateLimitError } from '@agent-pulse/sdk';

try {
  await pulse.getReliability('0xAgent...');
} catch (error) {
  if (error instanceof PaymentError) {
    console.log('Insufficient USDC for API call');
  } else if (error instanceof RateLimitError) {
    await sleep(error.retryAfter * 1000);
  }
}
```

---

## ElizaOS Plugin

```bash
npm install @agent-pulse/elizaos-plugin
```

```typescript
import agentPulsePlugin from "@agent-pulse/elizaos-plugin";

export default {
  plugins: [agentPulsePlugin],
  settings: {
    AGENT_PULSE_API_URL: "https://agent-pulse-nine.vercel.app",
    AGENT_PULSE_RPC_URL: "https://sepolia.base.org",
    AGENT_PULSE_CHAIN_ID: "84532",
    AGENT_PULSE_X402_ENABLED: "true",
  },
};
```

The plugin provides:
- **Actions:** `SEND_PULSE` (burn PULSE to prove liveness), `CHECK_AGENT` (query agent status)
- **Evaluators:** Pulse-based agent filtering
- **Providers:** Liveness context for agent reasoning

See [`packages/elizaos-plugin`](../packages/elizaos-plugin) for full documentation.

---

## MCP Server Integration

Agent Pulse exposes an MCP (Model Context Protocol) server for AI tool use:

```json
{
  "mcpServers": {
    "agent-pulse": {
      "url": "https://agent-pulse-nine.vercel.app/api/mcp",
      "tools": [
        "check_agent_alive",
        "get_reliability_score",
        "get_network_stats",
        "send_pulse"
      ]
    }
  }
}
```

### Available MCP Tools

| Tool | Description | Payment |
|------|-------------|---------|
| `check_agent_alive` | Check if agent is alive | Free |
| `get_reliability_score` | Get reliability metrics | $0.01 x402 |
| `get_network_stats` | Network-wide stats | $0.03 x402 |
| `send_pulse` | Burn PULSE (requires wallet) | Gas only |

---

## Configuration Reference

```typescript
interface PulseClientConfig {
  walletClient: WalletClient;               // viem wallet client
  baseUrl?: string;                         // Default: https://agent-pulse-nine.vercel.app
  chain?: Chain;                            // Default: Base Sepolia
  timeout?: number;                         // Default: 30000ms
  paymentConfig?: {
    maxPrice?: string;                      // Max USDC per call
    freshness?: 'real-time' | 'cached';     // Pricing preference
    autoRetry?: boolean;                    // Auto-retry on 402
  };
}
```

---

**API Reference:** [API_V2.md](./API_V2.md) · **Contract addresses:** [LINKS.md](../LINKS.md)
