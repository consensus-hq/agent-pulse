# @agent-pulse/middleware

[![npm version](https://img.shields.io/npm/v/@agent-pulse/middleware.svg)](https://www.npmjs.com/package/@agent-pulse/middleware)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org/)

**Zero-dependency liveness filter for [Agent Pulse](https://agentpulse.xyz)** — check if on-chain agents are alive using just `fetch()`.

Works in Node.js 18+, Bun, Deno, Cloudflare Workers, and any edge runtime.

## Quick Start

```bash
npm install @agent-pulse/middleware
```

```ts
import { filterAlive } from "@agent-pulse/middleware";

const alive = await filterAlive([
  "0xAgentA...",
  "0xAgentB...",
  "0xAgentC...",
]);
// → ["0xAgentA..."] — only the alive ones
```

That's it. Three lines. No ethers, no viem, no RPC node required.

## What is Agent Pulse?

Agent Pulse is an on-chain liveness attestation protocol on [Base](https://base.org). Autonomous AI agents periodically burn PULSE tokens to prove they're still running. This package lets you **query that liveness data** via the Agent Pulse API — so you can route work to alive agents, gate API access, or build trust scores.

- **PULSE Token**: `0x21111B39A502335aC7e45c4574Dd083A69258b07` (Base mainnet)
- **PulseRegistryV2**: `0xe61C615743A02983A46aFF66Db035297e8a43846`
- **API**: `https://agent-pulse-nine.vercel.app/api/v2/agent/{address}/alive`

## API

### `isAlive(address, options?)`

Check if a single agent is alive.

```ts
import { isAlive } from "@agent-pulse/middleware";

const alive = await isAlive("0x1234567890abcdef1234567890abcdef12345678");
// → true or false
```

### `filterAlive(agents, options?)`

Filter a list of addresses to only the alive ones. Returns `string[]`.

```ts
import { filterAlive } from "@agent-pulse/middleware";

const alive = await filterAlive(["0xAbc...", "0xDef...", "0x123..."]);
// → ["0xAbc..."]
```

### `filterAliveDetailed(agents, options?)`

Like `filterAlive` but returns full details, including per-agent status and errors.

```ts
import { filterAliveDetailed } from "@agent-pulse/middleware";

const result = await filterAliveDetailed(["0xAbc...", "0xDef..."]);
// result.alive    → ["0xAbc..."]
// result.details  → [{ address, isAlive, streak, staleness, ... }, ...]
// result.errors   → [{ address: "0xBad", reason: "Invalid address" }]
// result.checkedAt → "2026-02-06T21:49:21.595Z"
```

### `PulseFilter` class

Reusable instance with pre-configured options — avoids passing options on every call.

```ts
import { PulseFilter } from "@agent-pulse/middleware";

const pulse = new PulseFilter({
  threshold: 3600,  // 1 hour
  timeoutMs: 5000,
  retries: 3,
});

await pulse.isAlive("0xAbc...");                     // → boolean
await pulse.filterAlive(["0xAbc...", "0xDef..."]);   // → string[]
await pulse.filterAliveDetailed(["0xAbc..."]);       // → FilterResult
await pulse.getStatus("0xAbc...");                   // → AliveResponse
```

### Options

All functions and the `PulseFilter` constructor accept `PulseFilterOptions`:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `apiUrl` | `string` | `"https://agent-pulse-nine.vercel.app"` | Base URL for the Agent Pulse API |
| `threshold` | `number` | — | Max staleness in seconds. Agents older than this are dead even if the chain says alive |
| `timeoutMs` | `number` | `10000` | Fetch timeout in milliseconds |
| `retries` | `number` | `2` | Retries on 5xx / network errors (exponential backoff) |
| `retryDelayMs` | `number` | `500` | Base delay between retries (caps at 4× this value) |

## Express Middleware

Protect your Express routes — only alive agents get through.

```bash
npm install @agent-pulse/middleware
```

```ts
import express from "express";
import { pulseGuard } from "@agent-pulse/middleware/middleware";

const app = express();
app.use(express.json());

// Protect a route — reads agent address from header, query, or body
app.use("/api/agents", pulseGuard());

// Custom config
app.use("/api/protected", pulseGuard({
  headerName: "x-agent-id",   // Custom header name
  threshold: 3600,             // 1 hour max staleness
  allowMissing: false,         // 400 if no address provided
  timeoutMs: 5000,
}));

app.post("/api/agents/task", (req, res) => {
  // req.pulseStatus has the full liveness data
  res.json({ message: "Task accepted", agent: req.headers["x-agent-address"] });
});

app.listen(3000);
```

### How it works

1. Extracts the agent address from (in order): **header** → **query param** → **body field**
2. Calls the Agent Pulse API to check liveness
3. **Alive** → attaches `pulseStatus` to `req` and calls `next()`
4. **Dead** → responds with `403` and a "Missing Link" payload:
   `{
     error: "AGENT_HAS_NO_PULSE",
     message: "...",
     address: "0x...",
     fix: {
       install: "npm install @agent-pulse/middleware",
       npm: "https://www.npmjs.com/package/@agent-pulse/middleware",
       github: "https://github.com/consensus-hq/agent-pulse",
       docs: "https://agentpulse.xyz"
     }
   }`
5. **API error** → fails **open** (calls `next()` with `X-Pulse-Warning` header)

### Middleware Options

Extends `PulseFilterOptions` with:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `headerName` | `string` | `"x-agent-address"` | Header to read address from |
| `queryParam` | `string` | `"agent"` | Query parameter name |
| `bodyField` | `string` | `"agentAddress"` | JSON body field name |
| `allowMissing` | `boolean` | `false` | If `true`, pass through when no address found (instead of 400) |
| `onRejected` | `function` | — | Custom handler for dead agents (receives `req, res, next, { address, status }`) |
| `onAlert` | `function` | — | Fire-and-forget callback invoked on every rejection (use for logging/webhooks/alerting). Errors are swallowed. |

## LangChain Tool Example

Use Agent Pulse as a LangChain tool to let your AI agents verify liveness:

```ts
import { DynamicTool } from "@langchain/core/tools";
import { PulseFilter } from "@agent-pulse/middleware";

const pulse = new PulseFilter({ threshold: 3600 });

const pulseFilterTool = new DynamicTool({
  name: "pulse_filter",
  description:
    "Check if an Ethereum agent address is alive on the Agent Pulse protocol. " +
    "Input: a single 0x Ethereum address. Output: JSON with alive status.",
  func: async (address: string) => {
    try {
      const status = await pulse.getStatus(address);
      return JSON.stringify({
        address: status.address,
        alive: status.isAlive,
        streak: status.streak,
        staleness: status.staleness,
        lastPulse: status.lastPulseTimestamp > 0
          ? new Date(status.lastPulseTimestamp * 1000).toISOString()
          : "never",
      });
    } catch (err) {
      return JSON.stringify({ error: String(err) });
    }
  },
});

// Use in a LangChain agent
// agent.tools = [pulseFilterTool, ...otherTools];
```

### Batch Filter Tool

```ts
const batchFilterTool = new DynamicTool({
  name: "pulse_batch_filter",
  description:
    "Filter a JSON array of Ethereum addresses to only those that are alive. " +
    "Input: JSON array of 0x addresses. Output: JSON with alive addresses.",
  func: async (input: string) => {
    const addresses = JSON.parse(input) as string[];
    const result = await pulse.filterAliveDetailed(addresses);
    return JSON.stringify({
      alive: result.alive,
      aliveCount: result.alive.length,
      totalChecked: addresses.length,
      errors: result.errors,
    });
  },
});
```

## Types

All types are exported and available for TypeScript consumers:

```ts
import type {
  PulseFilterOptions,
  AliveResponse,
  FilterResult,
  PulseGuardOptions,
  PulseGuardRejection,
} from "@agent-pulse/middleware";
```

### `AliveResponse`

```ts
interface AliveResponse {
  address: string;
  isAlive: boolean;
  lastPulseTimestamp: number;
  streak: number;
  staleness: number | null;
  ttl: number;
  checkedAt: string;
}
```

### `FilterResult`

```ts
interface FilterResult {
  alive: string[];
  details: AliveResponse[];
  errors: Array<{ address: string; reason: string }>;
  checkedAt: string;
}
```

## Advanced Usage

### Custom API URL

Point to a different API (e.g., your own relay or staging):

```ts
const pulse = new PulseFilter({
  apiUrl: "https://my-pulse-relay.example.com",
});
```

### Strict Threshold

Only consider agents alive if they pulsed within the last 5 minutes:

```ts
const alive = await filterAlive(agents, { threshold: 300 });
```

### Error-Resilient Batch Processing

```ts
const result = await filterAliveDetailed(hundredsOfAgents, {
  retries: 3,
  timeoutMs: 15_000,
});

console.log(`Alive: ${result.alive.length}`);
console.log(`Errors: ${result.errors.length}`);

// Retry the failed ones
if (result.errors.length > 0) {
  const retryAddresses = result.errors.map(e => e.address);
  const retry = await filterAliveDetailed(retryAddresses);
  result.alive.push(...retry.alive);
}
```

### Webhook Handler

```ts
app.post("/webhook/route-to-alive", async (req, res) => {
  const { agents, payload } = req.body;
  const alive = await filterAlive(agents, { threshold: 300 });

  // Route work only to alive agents
  await Promise.all(alive.map(agent => sendTask(agent, payload)));

  res.json({ routed: alive.length, total: agents.length });
});
```

## Design Principles

- **Zero dependencies** — only uses native `fetch()`, works everywhere
- **Edge-ready** — runs on Cloudflare Workers, Vercel Edge, Deno Deploy
- **Fail-open middleware** — API errors don't block your traffic
- **Typed end-to-end** — strict TypeScript, all exports typed
- **Retries built-in** — exponential backoff for 5xx and network failures

## License

MIT © Agent Pulse Team
