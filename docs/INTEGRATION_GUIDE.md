# Agent Pulse Integration Guide

> **Integrating pulse-filter into agent frameworks** — LangChain, ElizaOS, OpenClaw, and custom frameworks

This guide shows you how to integrate Agent Pulse liveness verification into popular AI agent frameworks.

---

## Table of Contents

- [LangChain Integration](#langchain-integration)
- [ElizaOS Integration](#elizaos-integration)
- [OpenClaw Skill Usage](#openclaw-skill-usage)
- [Custom Framework Integration](#custom-framework-integration)

---

## LangChain Integration

### Installation

```bash
pip install langchain-pulse  # Python
npm install @agent-pulse/langchain  # JavaScript
```

### Python Integration

```python
from langchain_pulse import PulseFilter, PulseRetriever
from langchain.agents import AgentExecutor, create_openai_functions_agent

# Initialize Pulse filter
pulse_filter = PulseFilter(
    threshold="24h",      # Only agents that pulsed within 24h
    min_reliability=80,   # Minimum reliability score
    min_streak=3          # Minimum pulse streak
)

# Create a retriever that only returns live agents
live_agent_retriever = PulseRetriever(
    filter=pulse_filter,
    api_key="your-pulse-api-key"  # Optional for paid tier
)

# Use in your agent
tools = [
    Tool(
        name="find_workers",
        func=live_agent_retriever.get_relevant_agents,
        description="Find live AI agents for task delegation"
    )
]
```

### JavaScript/TypeScript Integration

```typescript
import { PulseFilter } from '@agent-pulse/langchain';
import { DynamicTool } from '@langchain/core/tools';

// Create pulse filter tool
const pulseFilterTool = new DynamicTool({
  name: 'filter_alive_agents',
  description: 'Filter agent list to only include live agents with pulse verification',
  func: async (input: string) => {
    const candidates = JSON.parse(input);
    
    const filter = new PulseFilter({
      threshold: '24h',
      minStreak: 3
    });
    
    const alive = await filter.apply(candidates);
    return JSON.stringify(alive);
  }
});

// Add to your agent's tools
const tools = [pulseFilterTool, /* other tools */];

const agent = createOpenAIFunctionsAgent({
  llm,
  tools,
  prompt
});
```

### LangChain Expression Language (LCEL)

```typescript
import { RunnableSequence } from '@langchain/core/runnables';
import { PulseFilter } from '@agent-pulse/langchain';

const chain = RunnableSequence.from([
  // Get candidates from registry
  async (input) => registry.getAgents(input.taskType),
  
  // Filter to only alive agents
  async (candidates) => {
    const pulse = new PulseFilter({ threshold: '24h' });
    return pulse.filter(candidates);
  },
  
  // Sort by reliability
  async (alive) => alive.sort((a, b) => b.reliability - a.reliability),
  
  // Select top 3
  (sorted) => sorted.slice(0, 3)
]);

const bestAgents = await chain.invoke({ taskType: 'copywriter' });
```

---

## ElizaOS Integration

### Plugin Installation

```bash
npm install @agent-pulse/elizaos-plugin
```

### Configuration

```typescript
// eliza.config.ts
import agentPulsePlugin from '@agent-pulse/elizaos-plugin';

export default {
  plugins: [
    agentPulsePlugin
  ],
  
  settings: {
    // Required
    AGENT_PULSE_API_URL: "https://agent-pulse-nine.vercel.app",
    
    // Optional (defaults shown)
    AGENT_PULSE_RPC_URL: "https://sepolia.base.org",
    AGENT_PULSE_CHAIN_ID: "84532",
    AGENT_PULSE_X402_ENABLED: "true",
    
    // Your agent's wallet private key (for sending pulses)
    AGENT_PULSE_PRIVATE_KEY: process.env.PULSE_PRIVATE_KEY,
    
    // Pulse settings
    AGENT_PULSE_AMOUNT: "1",        // PULSE tokens per pulse
    AGENT_PULSE_INTERVAL: "3600"    // Pulse every hour (seconds)
  }
};
```

### Automatic Pulsing

```typescript
// The plugin automatically sends pulses to prove liveness
// No additional code required — configure and it runs

// Access pulse status in your agent
import { getPulseStatus } from '@agent-pulse/elizaos-plugin';

export const actions = [
  {
    name: 'CHECK_LIVENESS',
    handler: async (message, state) => {
      const status = await getPulseStatus(state.agentId);
      
      return {
        text: `My pulse status: ${status.isAlive ? '✅ Alive' : '❌ Stale'}\n` +
              `Current streak: ${status.streak} pulses\n` +
              `Reliability: ${status.reliabilityScore}/100`
      };
    }
  }
];
```

### Routing with Pulse Filter

```typescript
// In your ElizaOS router action
import { filterAlive, getReliabilityScore } from '@agent-pulse/elizaos-plugin';

export const routeTaskAction = {
  name: 'ROUTE_TASK',
  handler: async (message, state) => {
    // Get all registered workers
    const allWorkers = await state.registry.getWorkers(message.content.taskType);
    
    // Filter to only alive agents
    const aliveWorkers = await filterAlive(allWorkers, {
      threshold: '24h',
      minStreak: 3
    });
    
    if (aliveWorkers.length === 0) {
      return { text: 'No alive workers available for this task type' };
    }
    
    // Get reliability scores for ranking
    const scoredWorkers = await Promise.all(
      aliveWorkers.map(async (w) => ({
        ...w,
        reliability: await getReliabilityScore(w.address)
      }))
    );
    
    // Select most reliable
    const bestWorker = scoredWorkers.sort((a, b) => 
      b.reliability.score - a.reliability.score
    )[0];
    
    // Dispatch task
    await dispatchTask(message.content.task, bestWorker);
    
    return {
      text: `Task routed to ${bestWorker.name} (reliability: ${bestWorker.reliability.score})`
    };
  }
};
```

### Custom Provider Integration

```typescript
// Create a custom provider that exposes pulse data
import { Provider } from '@elizaos/core';
import { PulseClient } from '@agent-pulse/sdk';

export const pulseProvider: Provider = {
  get: async (runtime, message, state) => {
    const pulse = new PulseClient({
      walletClient: runtime.walletClient
    });
    
    const status = await pulse.getStatus(runtime.agentId);
    const reliability = await pulse.getReliability(runtime.agentId);
    
    return {
      isAlive: status.isAlive,
      streak: status.streak,
      reliabilityScore: reliability.score,
      uptimePercent: reliability.uptimePercent
    };
  }
};

// Use in your agent
export default {
  providers: [pulseProvider],
  // ...
};
```

---

## OpenClaw Skill Usage

### Installation

```bash
clawhub install agent-pulse
```

### Skill Configuration

Add to your OpenClaw agent configuration:

```yaml
# skills/agent-pulse/skill.yaml
name: agent-pulse
version: 0.2.0
description: Agent liveness verification and reliability scoring

config:
  api_url: https://agent-pulse-nine.vercel.app
  chain: base-sepolia
  auto_pulse: true
  pulse_interval: 3600  # seconds

auth:
  type: x402
  wallet_env: PULSE_WALLET_KEY
```

### Available Tools

```typescript
// The skill exposes these tools to your agent

// 1. Send pulse signal
const pulseResult = await tools.pulse_beat({
  amount: '1'  // PULSE tokens
});

// 2. Check agent status (free)
const status = await tools.pulse_check_status({
  address: '0xAgentAddress...'
});

// 3. Get reliability score (paid)
const reliability = await tools.pulse_get_reliability({
  address: '0xAgentAddress...'
});

// 4. Filter alive agents (free)
const aliveAgents = await tools.pulse_filter_alive({
  agents: ['0x1...', '0x2...', '0x3...'],
  threshold: '24h'
});

// 5. Get liveness proof (paid)
const proof = await tools.pulse_get_proof({
  address: '0xAgentAddress...'
});
```

### Example Agent Task

```typescript
// agents/my-router.ts
export default {
  name: 'TaskRouter',
  
  async run(input, context) => {
    const { task, requiredSkills } = input;
    
    // Find candidates with required skills
    const candidates = await context.tools.registry_search({
      skills: requiredSkills
    });
    
    // Filter to alive agents using pulse-filter
    const aliveCandidates = await context.tools.pulse_filter_alive({
      agents: candidates.map(c => c.address),
      threshold: '24h',
      min_streak: 3
    });
    
    if (aliveCandidates.length === 0) {
      return {
        success: false,
        error: 'No alive agents available'
      };
    }
    
    // Get reliability for ranking
    const ranked = await Promise.all(
      aliveCandidates.map(async (addr) => ({
        address: addr,
        reliability: await context.tools.pulse_get_reliability({ address: addr })
      }))
    );
    
    ranked.sort((a, b) => b.reliability.score - a.reliability.score);
    
    // Route to best agent
    await context.tools.dispatch_task({
      task,
      agent: ranked[0].address
    });
    
    return {
      success: true,
      selected: ranked[0]
    };
  }
};
```

### Environment Setup

```bash
# .env
PULSE_WALLET_KEY=0x...          # Private key for pulse transactions
PULSE_API_KEY=optional_key      # For higher rate limits
```

---

## Custom Framework Integration

### Generic Middleware Pattern

```typescript
// pulse-middleware.ts
import { PulseClient } from '@agent-pulse/sdk';

interface Agent {
  address: string;
  name: string;
  // ... other properties
}

interface PulseFilterOptions {
  threshold?: string;      // e.g., '24h', '1h', '7d'
  minStreak?: number;      // Minimum pulse streak
  minReliability?: number; // Minimum reliability score (0-100)
}

export class PulseMiddleware {
  private client: PulseClient;
  
  constructor(walletClient) {
    this.client = new PulseClient({ walletClient });
  }
  
  /**
   * Filter agents to only include live ones
   */
  async filterAlive(
    agents: Agent[],
    options: PulseFilterOptions = {}
  ): Promise<Agent[]> {
    const { threshold = '24h', minStreak = 0, minReliability = 0 } = options;
    
    const thresholdMs = this.parseThreshold(threshold);
    const now = Date.now();
    
    const results = await Promise.all(
      agents.map(async (agent) => {
        try {
          const [status, reliability] = await Promise.all([
            this.client.getStatus(agent.address),
            minReliability > 0 
              ? this.client.getReliability(agent.address)
              : Promise.resolve({ score: 100 })
          ]);
          
          const lastPulseMs = new Date(status.lastPulse).getTime();
          const isFresh = (now - lastPulseMs) < thresholdMs;
          
          const meetsStreak = status.streak >= minStreak;
          const meetsReliability = reliability.score >= minReliability;
          
          return isFresh && meetsStreak && meetsReliability
            ? agent
            : null;
        } catch (error) {
          console.error(`Failed to check ${agent.address}:`, error);
          return null;
        }
      })
    );
    
    return results.filter((a): a is Agent => a !== null);
  }
  
  /**
   * Rank agents by reliability
   */
  async rankByReliability(agents: Agent[]): Promise<Agent[]> {
    const scored = await Promise.all(
      agents.map(async (agent) => {
        const reliability = await this.client.getReliability(agent.address);
        return {
          ...agent,
          _reliability: reliability.score
        };
      })
    );
    
    return scored
      .sort((a, b) => b._reliability - a._reliability)
      .map(({ _reliability, ...agent }) => agent);
  }
  
  private parseThreshold(threshold: string): number {
    const match = threshold.match(/^(\d+)([hmd])$/);
    if (!match) throw new Error(`Invalid threshold: ${threshold}`);
    
    const [, num, unit] = match;
    const multipliers = { h: 3600_000, m: 60_000, d: 86400_000 };
    
    return parseInt(num) * multipliers[unit];
  }
}
```

### Router Integration Example

```typescript
// Integrate with your custom router
class SmartRouter {
  private pulse: PulseMiddleware;
  private registry: AgentRegistry;
  
  constructor(walletClient, registry) {
    this.pulse = new PulseMiddleware(walletClient);
    this.registry = registry;
  }
  
  async routeTask(task: Task): Promise<RoutingResult> {
    // 1. Get candidates from registry
    const candidates = await this.registry.findAgents({
      capabilities: task.requiredCapabilities
    });
    
    console.log(`Found ${candidates.length} candidates`);
    
    // 2. Filter to alive agents
    const alive = await this.pulse.filterAlive(candidates, {
      threshold: '24h',
      minStreak: 3,
      minReliability: 70
    });
    
    console.log(`${alive.length} candidates are alive`);
    
    if (alive.length === 0) {
      throw new Error('No alive agents available');
    }
    
    // 3. Rank by reliability
    const ranked = await this.pulse.rankByReliability(alive);
    
    // 4. Select top 3 for redundancy
    const selected = ranked.slice(0, 3);
    
    // 5. Dispatch
    return this.dispatch(task, selected);
  }
  
  private async dispatch(task: Task, agents: Agent[]): Promise<RoutingResult> {
    // Your dispatch logic here
    return {
      taskId: task.id,
      assignedAgents: agents.map(a => a.address),
      strategy: agents.length > 1 ? 'redundant' : 'single'
    };
  }
}
```

### Health Check Integration

```typescript
// Add pulse health to your monitoring
class AgentHealthMonitor {
  private pulse: PulseClient;
  
  async checkAgentHealth(address: string): Promise<HealthStatus> {
    const [status, metrics] = await Promise.all([
      this.pulse.getStatus(address),
      this.pulse.getUptimeMetrics(address)
    ]);
    
    // Determine health level
    let health: 'healthy' | 'degraded' | 'critical';
    
    if (!status.isAlive) {
      health = 'critical';
    } else if (metrics.uptimePercent < 95) {
      health = 'degraded';
    } else {
      health = 'healthy';
    }
    
    return {
      address,
      health,
      isAlive: status.isAlive,
      uptimePercent: metrics.uptimePercent,
      lastPulse: status.lastPulse,
      recommendations: this.generateRecommendations(health, metrics)
    };
  }
  
  private generateRecommendations(
    health: string,
    metrics: any
  ): string[] {
    const recs: string[] = [];
    
    if (health === 'critical') {
      recs.push('Agent has not pulsed recently — check if agent is running');
    }
    
    if (metrics.uptimePercent < 90) {
      recs.push('Uptime below 90% — investigate stability issues');
    }
    
    if (metrics.downtimeEvents > 5) {
      recs.push('Multiple downtime events — consider redundant deployment');
    }
    
    return recs;
  }
}
```

### Testing Your Integration

```typescript
// tests/pulse-integration.test.ts
import { describe, it, expect } from 'vitest';
import { PulseMiddleware } from './pulse-middleware';

describe('Pulse Middleware', () => {
  const mockWalletClient = {} as any;
  const middleware = new PulseMiddleware(mockWalletClient);
  
  it('should filter out dead agents', async () => {
    const agents = [
      { address: '0xAlive...', name: 'Good Agent' },
      { address: '0xDead...', name: 'Bad Agent' }
    ];
    
    // Mock the pulse client responses
    vi.spyOn(middleware['client'], 'getStatus')
      .mockResolvedValueOnce({ isAlive: true, lastPulse: Date.now(), streak: 10 })
      .mockResolvedValueOnce({ isAlive: false, lastPulse: Date.now() - 86400_000, streak: 0 });
    
    const alive = await middleware.filterAlive(agents, { threshold: '24h' });
    
    expect(alive).toHaveLength(1);
    expect(alive[0].name).toBe('Good Agent');
  });
  
  it('should rank by reliability', async () => {
    const agents = [
      { address: '0xLow...', name: 'Unreliable' },
      { address: '0xHigh...', name: 'Reliable' }
    ];
    
    vi.spyOn(middleware['client'], 'getReliability')
      .mockResolvedValueOnce({ score: 50 })
      .mockResolvedValueOnce({ score: 95 });
    
    const ranked = await middleware.rankByReliability(agents);
    
    expect(ranked[0].name).toBe('Reliable');
    expect(ranked[1].name).toBe('Unreliable');
  });
});
```

---

## Best Practices

### 1. Always Have a Fallback

```typescript
const aliveAgents = await pulse.filterAlive(candidates);

if (aliveAgents.length === 0) {
  // Fallback to manual selection or queue for later
  await queueTaskForLater(task);
  // OR
  const manualSelection = await promptUserForSelection(candidates);
}
```

### 2. Cache Pulse Status

```typescript
// Don't check the same agent multiple times
const pulseCache = new Map<string, { status: any; timestamp: number }>();

async function getCachedStatus(address: string) {
  const cached = pulseCache.get(address);
  if (cached && Date.now() - cached.timestamp < 60000) {
    return cached.status;
  }
  
  const status = await pulse.getStatus(address);
  pulseCache.set(address, { status, timestamp: Date.now() });
  return status;
}
```

### 3. Handle Payment Errors Gracefully

```typescript
try {
  const reliability = await pulse.getReliability(agent);
} catch (error) {
  if (error.code === 'INSUFFICIENT_FUNDS') {
    // Fall back to free tier
    const status = await pulse.getStatus(agent);
    return { basicStatus: status };
  }
  throw error;
}
```

---

## Troubleshooting

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| 402 Payment Required | No valid x402 payment | Ensure wallet has USDC and is on Base |
| 429 Rate Limited | Too many requests | Implement caching or upgrade tier |
| Agent not found | Address never sent pulse | Check address or wait for first pulse |
| Payment expired | Authorization too old | Retry with fresh signature |

---

## API Reference

- **API v2:** See [API_V2.md](./API_V2.md)
- **SDK Quickstart:** See [SDK_QUICKSTART.md](./SDK_QUICKSTART.md)

---

**Contract addresses:** See [LINKS.md](../LINKS.md)
