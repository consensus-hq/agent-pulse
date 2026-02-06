# @agent-pulse/middleware

Middleware for filtering alive agents from the PulseRegistry. Works with LangChain, AutoGen, and ElizaOS.

## Installation

```bash
npm install @agent-pulse/middleware
```

## Quick Start

```typescript
import { filterAlive } from '@agent-pulse/middleware';

const result = await filterAlive(
  ['0x1234...', '0x5678...'],
  {
    threshold: 3600, // 1 hour in seconds
    registryAddress: '0xe61C615743A02983A46aFF66Db035297e8a43846',
    rpcUrl: 'https://sepolia.base.org',
  }
);

console.log('Alive agents:', result.alive);
```

## Configuration

| Option | Type | Description |
|--------|------|-------------|
| `threshold` | `number` | Time threshold in seconds. Agents that haven't pulsed within this window are filtered out. |
| `registryAddress` | `Address` | The PulseRegistry contract address. |
| `rpcUrl` | `string` | RPC endpoint URL (e.g., `https://sepolia.base.org`). |
| `chain` | `Chain` | *(Optional)* Custom viem chain config. Defaults to Base Sepolia. |

## Usage Examples

### Basic Filtering

```typescript
import { filterAlive, isAgentAlive, getRegistryTTL } from '@agent-pulse/middleware';

// Filter multiple agents
const result = await filterAlive(agentAddresses, {
  threshold: 3600,
  registryAddress: '0xe61C615743A02983A46aFF66Db035297e8a43846',
  rpcUrl: 'https://sepolia.base.org',
});

console.log(result.alive);     // ['0x1234...', '0x5678...']
console.log(result.details);   // Full status for each agent
console.log(result.errors);    // Any validation errors

// Check single agent
const status = await isAgentAlive(agentAddress, {
  registryAddress: '0xe61C615743A02983A46aFF66Db035297e8a43846',
  rpcUrl: 'https://sepolia.base.org',
});

// Get registry TTL
const ttl = await getRegistryTTL({
  registryAddress: '0xe61C615743A02983A46aFF66Db035297e8a43846',
  rpcUrl: 'https://sepolia.base.org',
});
```

### LangChain Integration

```typescript
import { LangChainTool } from '@agent-pulse/middleware';

const aliveFilterTool = new LangChainTool({
  threshold: 3600,
  registryAddress: '0xe61C615743A02983A46aFF66Db035297e8a43846',
  rpcUrl: 'https://sepolia.base.org',
});

// Use with LangChain agents
const result = await aliveFilterTool.call(['0x1234...', '0x5678...']);
console.log(JSON.parse(result));
// { alive: [...], count: 2, total: 2, timestamp: 1707000000 }
```

### AutoGen Integration

```typescript
import { AutoGenTool } from '@agent-pulse/middleware';

const autoGenTool = new AutoGenTool({
  threshold: 3600,
  registryAddress: '0xe61C615743A02983A46aFF66Db035297e8a43846',
  rpcUrl: 'https://sepolia.base.org',
});

// Register with AutoGen
userProxy.register_function({
  function_map: {
    filter_alive_agents: autoGenTool.filterAgents.bind(autoGenTool),
    check_agent: autoGenTool.checkAgent.bind(autoGenTool),
  },
});
```

### ElizaOS Integration

```typescript
import { ElizaAction } from '@agent-pulse/middleware';

const elizaAction = new ElizaAction({
  threshold: 3600,
  registryAddress: '0xe61C615743A02983A46aFF66Db035297e8a43846',
  rpcUrl: 'https://sepolia.base.org',
});

// Register with Eliza runtime
runtime.registerAction(elizaAction.toElizaAction());

// Now agents can say:
// "Check if 0x1234... and 0x5678... are alive"
```

### Generic Filter Factory

```typescript
import { createFilter } from '@agent-pulse/middleware';

const filter = createFilter({
  threshold: 3600,
  registryAddress: '0xe61C615743A02983A46aFF66Db035297e8a43846',
  rpcUrl: 'https://sepolia.base.org',
});

const aliveAgents = await filter(['0x1234...', '0x5678...']);
```

## GTM Playbook Examples

### Discord Bot Integration

```typescript
import { createFilter, serializeBigInt } from '@agent-pulse/middleware';

const filter = createFilter({
  threshold: 7200, // 2 hours
  registryAddress: process.env.REGISTRY_ADDRESS!,
  rpcUrl: process.env.RPC_URL!,
});

// Discord bot command
bot.on('message', async (msg) => {
  if (msg.content.startsWith('!check-agents')) {
    const addresses = extractAddresses(msg.content);
    const result = await filter(addresses);
    
    msg.reply(`Alive agents (${result.alive.length}): ${result.alive.join(', ')}`);
  }
});
```

### Webhook Handler

```typescript
import { filterAlive } from '@agent-pulse/middleware';

app.post('/webhook/filter-agents', async (req, res) => {
  const { addresses, threshold = 3600 } = req.body;
  
  const result = await filterAlive(addresses, {
    threshold,
    registryAddress: process.env.REGISTRY_ADDRESS!,
    rpcUrl: process.env.RPC_URL!,
  });
  
  res.json({
    alive: result.alive,
    total: addresses.length,
    timestamp: result.timestamp,
  });
});
```

### Multi-Agent Workflow

```typescript
import { filterAlive } from '@agent-pulse/middleware';

async function routeToAliveAgents(allAgents: Address[], payload: unknown) {
  // Filter to only alive agents
  const { alive } = await filterAlive(allAgents, {
    threshold: 300, // 5 minutes - strict liveness
    registryAddress: process.env.REGISTRY_ADDRESS!,
    rpcUrl: process.env.RPC_URL!,
  });
  
  // Distribute work only to alive agents
  const tasks = alive.map(agent => sendTask(agent, payload));
  await Promise.all(tasks);
  
  return { routed: alive.length, total: allAgents.length };
}
```

## API Reference

### `filterAlive(agents, options)`

Batch filter agents to return only those that are alive and within threshold.

**Parameters:**
- `agents: Address[]` - Array of Ethereum addresses to check
- `options: FilterOptions` - Configuration options

**Returns:** `Promise<FilterResult>`
- `alive: Address[]` - Addresses that passed the filter
- `details: AgentStatus[]` - Full status for all queried agents
- `errors: Array<{ address, reason }>` - Validation errors
- `timestamp: number` - Current timestamp used for filtering

### `isAgentAlive(agent, options)`

Check if a single agent is alive.

**Parameters:**
- `agent: Address` - Single Ethereum address
- `options: Omit<FilterOptions, 'threshold'>` - Configuration (threshold not needed)

**Returns:** `Promise<{ alive, lastPulseAt, streak, hazardScore }>`

### `getRegistryTTL(options)`

Get the TTL (time-to-live) configured in the registry.

**Returns:** `Promise<bigint>`

## Contract Addresses

### Base Sepolia (Testnet)
- **PulseRegistry**: `0xe61C615743A02983A46aFF66Db035297e8a43846`
- **RPC**: `https://sepolia.base.org`

## License

MIT
