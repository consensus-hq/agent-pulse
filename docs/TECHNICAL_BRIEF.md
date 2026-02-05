# Pulse of Life Protocol — Technical Brief

**Research Analyst:** Agent 2  
**Date:** 2026-02-05  
**Version:** 1.0  
**Purpose:** Guide the Builder (Agent 3) through deployment execution and dashboard implementation  

---

## Executive Summary

This brief consolidates research on testnet selection, mainnet forking, wallet management, deployment procedures, RPC infrastructure, visualization architecture, and multi-mode configuration for the Pulse of Life Protocol verification effort. The protocol consists of:

- **PulseToken.sol** — ERC-20 utility token for signaling
- **PulseRegistry.sol** — On-chain agent liveness registry with TTL-based `isAlive` logic

---

## 1. Testnet Selection Analysis

### Comparison Matrix

| Criteria | Base Sepolia | Ethereum Sepolia | Arbitrum Sepolia | Optimism Sepolia |
|----------|--------------|------------------|------------------|------------------|
| **Chain ID** | 84532 | 11155111 | 421614 | 11155420 |
| **Block Time** | ~2s | ~12s | ~0.25s (batch) | ~2s |
| **Faucet Availability** | ⭐⭐⭐ (Coinbase, Alchemy, QuickNode) | ⭐⭐ (Alchemy, Infura, PoW) | ⭐⭐ (Alchemy, third-party) | ⭐⭐ (Alchemy, third-party) |
| **RPC Reliability** | ⭐⭐⭐⭐ (Coinbase infra) | ⭐⭐⭐⭐ (Battle-tested) | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| **Explorer Quality** | ⭐⭐⭐⭐ (basescan.org) | ⭐⭐⭐⭐⭐ (etherscan) | ⭐⭐⭐ (arbiscan) | ⭐⭐⭐⭐ (optimistic.etherscan) |
| **Mainnet Parity** | Optimism Stack (OP Stack) | Ethereum L1 | Arbitrum Nitro | Optimism Stack |
| **Contract Verification** | ✅ Standard JSON | ✅ Standard JSON | ✅ Standard JSON | ✅ Standard JSON |

### Recommendation: **Base Sepolia**

**Rationale:**
1. **Native L2 stack alignment** — Base uses OP Stack, matching production deployment target (Base mainnet)
2. **Fast block times** (~2s) enable rapid testing iteration vs Ethereum Sepolia's 12s
3. **Faucet abundance** — Multiple faucets available (Coinbase Developer Platform, Alchemy, QuickNode, Superchain Faucet)
4. **Explorer parity** — BaseScan (Sepolia) maintains UI/API consistency with Base mainnet
5. **Bridge availability** — Official Base bridge supports Sepolia for cross-chain testing

### Base Sepolia Configuration

```bash
# Chain Parameters
CHAIN_ID=84532
RPC_URL=https://sepolia.base.org
FORK_URL=https://sepolia.base.org
BLOCK_EXPLORER=https://sepolia.basescan.org

# Free RPC Endpoints (throttled)
- https://sepolia.base.org (Coinbase, 1 req/s)
- https://base-sepolia.g.alchemy.com/v2/{API_KEY} (Alchemy)
- https://base-sepolia.infura.io/v3/{API_KEY} (Infura)
```

### Faucet Strategy

| Faucet | Amount | Rate Limit | Auth Required |
|--------|--------|------------|---------------|
| Coinbase Developer Platform | 0.5 ETH/day | 1/day | Coinbase login |
| Alchemy | 0.5 ETH/day | 1/day | Alchemy account |
| QuickNode | 0.1 ETH | 1/week | QuickNode account |
| Superchain Faucet | 0.05 ETH | 1/day | GitHub OAuth |
| PoW Faucet | Variable | None | Mining time |

**Recommended approach:** Cycle through Coinbase + Alchemy daily for deployer; use QuickNode for backup.

---

## 2. Mainnet Fork Setup

### Anvil vs Hardhat Comparison

| Feature | Anvil (Foundry) | Hardhat Network |
|---------|-----------------|-----------------|
| **Fork Speed** | ⭐⭐⭐⭐⭐ (Rust) | ⭐⭐⭐ (Node.js) |
| **State Snapshots** | ✅ `anvil_dumpState` | ✅ `hardhat_dump` |
| **Impersonation** | ✅ `anvil_impersonateAccount` | ✅ `hardhat_impersonateAccount` |
| **Mining Control** | Auto/interval/manual | Auto/interval/manual |
| **Cast Integration** | Native | Via scripts |
| **Memory Usage** | Lower | Higher |
| **Startup Time** | Faster | Slower |

**Recommendation: Anvil** — Already used in existing scripts (`start-base-fork.sh`), faster, better Foundry integration.

### Fork Configuration

```bash
# Start Base mainnet fork at specific block
anvil \
  --fork-url https://mainnet.base.org \
  --fork-block-number 26000000 \
  --port 8545 \
  --chain-id 8453 \
  --accounts 10 \
  --balance 10000 \
  --state-interval 60 \
  --dump-state ./anvil-state.json

# Alternative: Use script
bash ./scripts/start-base-fork.sh
```
```

### Fork State Management

```typescript
// Load state from previous session
import { execSync } from 'child_process';

// Dump current state
execSync('cast rpc anvil_dumpState > ./snapshots/fork-state.json');

// Load state on restart
execSync('anvil --load-state ./snapshots/fork-state.json --fork-url https://mainnet.base.org');
```

### Funding Wallets on Fork

Anvil provides pre-funded accounts with 10,000 ETH each:

```
Account #0: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 (10000 ETH)
Private Key: 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

Account #1: 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 (10000 ETH)
Private Key: 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
```

For additional funding:

```typescript
import { ethers } from 'ethers';

const RPC_ENDPOINT = 'http://NODE:8545';
const provider = new ethers.JsonRpcProvider(RPC_ENDPOINT);
const funder = new ethers.Wallet(FUNDER_KEY, provider);

// Impersonate and fund any address
await provider.send('anvil_impersonateAccount', ['0x...vitalik...']);
await funder.sendTransaction({
  to: targetAddress,
  value: ethers.parseEther('1000')
});
```

### Connecting Dashboard to Local RPC

```typescript
// viem configuration for fork
import { createPublicClient, createWalletClient, http } from 'viem';
import { base } from 'viem/chains';

const forkClient = createPublicClient({
  chain: base,  // Keep chain config, override transport
  transport: http('http://LOCAL_NODE:8545'),
});

// Override chain ID check for fork
const forkWallet = createWalletClient({
  account,
  chain: { ...base, id: 8453 },  // Ensure matches fork
  transport: http('http://LOCAL_NODE:8545'),
});
```

### Fork vs Mainnet Behavioral Differences

| Behavior | Fork | Real Mainnet |
|----------|------|--------------|
| **Block production** | On-demand or interval | Consensus-driven |
| **Gas cost** | Fixed (configurable) | Market-driven |
| **Latency** | Local (<1ms) | Network (~100ms-1s) |
| **Reorgs** | Simulated only | Real possibility |
| **Time** | Can manipulate (`evm_increaseTime`) | Wall-clock time |
| **Oracle data** | Frozen at fork block | Live updates |

**Critical:** When testing time-dependent logic (TTL, streaks), use `evm_increaseTime` to simulate passage of time:

```typescript
// Advance time by 24 hours
await provider.send('evm_increaseTime', [86400]);
await provider.send('evm_mine');
```

---

## 3. Agent Wallet Setup

### Wallet Generation

```typescript
// scripts/generate-wallets.js (existing)
const { ethers } = require('ethers');
const fs = require('fs');

const wallets = [];
for (let i = 1; i <= 5; i++) {
  const wallet = ethers.Wallet.createRandom();
  wallets.push({
    label: i === 1 ? 'owner' : `agent-${i-1}`,
    address: wallet.address,
    privateKey: wallet.privateKey,
    role: i === 1 ? 'contract-owner' : 'test-agent'
  });
}

fs.writeFileSync('./wallets.json', JSON.stringify(wallets, null, 2));
```

### Funding Requirements

| Phase | Owner Wallet | Each Agent Wallet | Purpose |
|-------|--------------|-------------------|---------|
| **Deployment** | 0.02 ETH | — | Contract deployment gas |
| **Token Funding** | — | 100 PULSE (min) | Pulse operations |
| **Gas Reserve** | — | 0.001 ETH | Transaction gas |
| **Stress Test** | — | 1000 PULSE | High-frequency pulsing |
| **Buffer** | 0.01 ETH | 0.005 ETH | Contingency |

**Total per wallet for full test:**
- Owner: 0.03 ETH
- Each Agent: 0.006 ETH + 1000 PULSE

### Faucet Funding (Testnet)

**Option A: Manual (Recommended for 5 wallets)**
```bash
# Fund owner from faucet
# Then distribute to agents via script
```

**Option B: Automated (requires API keys)**
```typescript
// Coinbase CDP Faucet API (requires OAuth)
const fundFromCDP = async (address: string) => {
  const response = await fetch('https://portal.cdp.coinbase.com/api/faucet', {
    method: 'POST',
    headers: { Authorization: `Bearer ${CDP_TOKEN}` },
    body: JSON.stringify({ address, chain: 'base-sepolia' })
  });
  return response.json();
};
```

### Wallet Loading Pattern

```typescript
// Load from JSON for test runs
import wallets from './wallets.json';

const [owner, ...agents] = wallets.map(w => 
  privateKeyToAccount(w.privateKey as `0x${string}`)
);

// Usage in scripts
const ownerWallet = createWalletClient({
  account: owner,
  chain: baseSepolia,
  transport: http(RPC_URL),
});
```

---

## 4. Contract Deployment

### Using Existing Artifacts (viem)

```typescript
// Load Foundry-compiled artifacts
const artifactPath = resolve(__dirname, '../packages/contracts/out/PulseRegistry.sol/PulseRegistry.json');
const artifact = JSON.parse(readFileSync(artifactPath, 'utf8'));

// Deploy via viem
const hash = await walletClient.deployContract({
  abi: artifact.abi,
  bytecode: artifact.bytecode.object as `0x${string}`,
  args: [tokenAddress, burnSink, ttlSeconds, minPulseAmount],
});

const receipt = await publicClient.waitForTransactionReceipt({ hash });
console.log('Deployed at:', receipt.contractAddress);
```

### Using Foundry Scripts

```bash
# Deploy token
cd packages/contracts
forge create contracts/PulseToken.sol:PulseToken \
  --constructor-args "Pulse" "PULSE" 1000000000000000000000000 ${DEPLOYER_ADDRESS} \
  --rpc-url ${RPC_URL} \
  --private-key ${PRIVATE_KEY}

# Deploy registry
forge create contracts/PulseRegistry.sol:PulseRegistry \
  --constructor-args ${TOKEN_ADDR} ${BURN_SINK} 86400 1000000000000000000 \
  --rpc-url ${RPC_URL} \
  --private-key ${PRIVATE_KEY}
```

### Block Explorer Verification

```bash
# Verify on BaseScan (mainnet or sepolia)
forge verify-contract ${REGISTRY_ADDR} PulseRegistry \
  --chain ${CHAIN_ID} \
  --constructor-args $(cast abi-encode "constructor(address,address,uint256,uint256)" ${TOKEN_ADDR} ${BURN_SINK} 86400 1000000000000000000)

# Or verify already deployed contract
forge verify-contract ${TOKEN_ADDR} PulseToken \
  --chain ${CHAIN_ID} \
  --watch
```

### Deployment Verification Checklist

```typescript
// Automated smoke test post-deployment
const verifyDeployment = async (registryAddr: string, tokenAddr: string) => {
  const [ttl, minPulse, owner, token, sink] = await Promise.all([
    publicClient.readContract({ address: registryAddr, abi: REGISTRY_ABI, functionName: 'ttlSeconds' }),
    publicClient.readContract({ address: registryAddr, abi: REGISTRY_ABI, functionName: 'minPulseAmount' }),
    publicClient.readContract({ address: registryAddr, abi: REGISTRY_ABI, functionName: 'owner' }),
    publicClient.readContract({ address: registryAddr, abi: REGISTRY_ABI, functionName: 'pulseToken' }),
    publicClient.readContract({ address: registryAddr, abi: REGISTRY_ABI, functionName: 'signalSink' }),
  ]);
  
  assert(ttl === 86400n, 'TTL mismatch');
  assert(minPulse === parseEther('1'), 'Min pulse mismatch');
  assert(owner === expectedOwner, 'Owner mismatch');
  assert(token.toLowerCase() === tokenAddr.toLowerCase(), 'Token mismatch');
  assert(sink.toLowerCase() === BURN_SINK.toLowerCase(), 'Sink mismatch');
};
```

---

## 5. Live Chain Data

### Free RPC Providers

| Provider | Endpoint | Rate Limit | Features |
|----------|----------|------------|----------|
| **PublicNode** | https://base-rpc.publicnode.com | 10 req/s | No auth, reliable |
| **Coinbase** | https://mainnet.base.org | 1 req/s | Official |
| **Ankr** | https://rpc.ankr.com/base | 30 req/s | Requires key for higher |
| **Alchemy** | https://base-mainnet.g.alchemy.com | 300M compute/mo | Best reliability |
| **QuickNode** | https://{subdomain}.base-mainnet.quiknode.pro | Varies | Enterprise grade |

**Recommendation:** PublicNode for development, Alchemy for production dashboard.

### WebSocket vs Polling

| Method | Best For | Latency | Complexity |
|--------|----------|---------|------------|
| **WebSocket** | Real-time events, subscriptions | <100ms | Higher (connection mgmt) |
| **HTTP Polling** | Simple reads, throttled | 1-5s | Lower |
| **Webhook (Alchemy)** | Production notifications | <1s | Infrastructure required |

**For this dashboard:** Start with HTTP polling, upgrade to WebSocket for live pulse feed.

```typescript
// HTTP Polling approach
setInterval(async () => {
  const agents = await fetchActiveAgents();
  updateDashboard(agents);
}, 5_000); // 5 second refresh

// WebSocket approach (viem)
import { createPublicClient, webSocket } from 'viem';

const wsClient = createPublicClient({
  transport: webSocket('wss://base-mainnet.g.alchemy.com/v2/{KEY}'),
});

wsClient.watchContractEvent({
  address: REGISTRY_ADDR,
  abi: REGISTRY_ABI,
  eventName: 'Pulse',
  onLogs: (logs) => updateDashboard(logs),
});
```

### Reading Contract State

```typescript
// Key view functions from PulseRegistry

// 1. Check if agent is alive
const alive = await publicClient.readContract({
  address: REGISTRY_ADDR,
  abi: REGISTRY_ABI,
  functionName: 'isAlive',
  args: [agentAddress],
});

// 2. Get full agent status
const [isAlive, lastPulseAt, streak, hazardScore] = await publicClient.readContract({
  address: REGISTRY_ADDR,
  abi: REGISTRY_ABI,
  functionName: 'getAgentStatus',
  args: [agentAddress],
});

// 3. Check contract pause state
const paused = await publicClient.readContract({
  address: REGISTRY_ADDR,
  abi: REGISTRY_ABI,
  functionName: 'paused',
});

// 4. Get global parameters
const [ttl, minPulse] = await Promise.all([
  publicClient.readContract({ address: REGISTRY_ADDR, abi: REGISTRY_ABI, functionName: 'ttlSeconds' }),
  publicClient.readContract({ address: REGISTRY_ADDR, abi: REGISTRY_ABI, functionName: 'minPulseAmount' }),
]);

// Calculate time remaining until expiry
const timeRemaining = lastPulseAt + ttl - Math.floor(Date.now() / 1000);
const healthPercent = Math.max(0, (timeRemaining / Number(ttl)) * 100);
```

### Parsing Transaction Receipts

```typescript
const receipt = await publicClient.waitForTransactionReceipt({ hash });

// Check success
if (receipt.status !== 'success') {
  throw new Error('Transaction failed');
}

// Parse Pulse event
const pulseLogs = parseEventLogs({
  abi: REGISTRY_ABI,
  eventName: 'Pulse',
  logs: receipt.logs,
});

for (const log of pulseLogs) {
  console.log('Pulse detected:', {
    agent: log.args.agent,
    amount: log.args.amount,
    timestamp: log.args.timestamp,
    streak: log.args.streak,
  });
}
```

### Rate Limit-Safe Polling

```typescript
class RateLimitedPoller {
  private lastCall = 0;
  private minInterval: number;
  
  constructor(requestsPerSecond: number) {
    this.minInterval = 1000 / requestsPerSecond;
  }
  
  async poll<T>(fn: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const elapsed = now - this.lastCall;
    
    if (elapsed < this.minInterval) {
      await sleep(this.minInterval - elapsed);
    }
    
    this.lastCall = Date.now();
    return fn();
  }
}

// Usage with 2 req/s limit
const poller = new RateLimitedPoller(2);
const status = await poller.poll(() => 
  publicClient.readContract({ address: REGISTRY_ADDR, abi: REGISTRY_ABI, functionName: 'isAlive', args: [agentAddr] })
);
```

---

## 6. Visualization Stack

### Single-File React + Tailwind via CDN

```html
<!DOCTYPE html>
<html>
<head>
  <script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/viem@2/dist/index.umd.js"></script>
  <script src="https://unpkg.com/recharts@2/umd/Recharts.min.js"></script>
</head>
<body>
  <div id="root"></div>
  <script type="text/babel">
    const { useState, useEffect } = React;
    const { createPublicClient, http, parseAbi } = viem;
    const { LineChart, Line, XAxis, YAxis, Tooltip } = Recharts;
    
    // Dashboard implementation here
  </script>
</body>
</html>
```

### viem Integration

```typescript
import { createPublicClient, http, parseAbi } from 'viem';
import { base, baseSepolia } from 'viem/chains';

const REGISTRY_ABI = parseAbi([
  'function isAlive(address agent) view returns (bool)',
  'function getAgentStatus(address agent) view returns (bool alive, uint256 lastPulseAt, uint256 streak, uint256 hazardScore)',
  'function ttlSeconds() external view returns (uint256)',
  'function minPulseAmount() external view returns (uint256)',
  'function paused() external view returns (bool)',
  'event Pulse(address indexed agent, uint256 amount, uint256 timestamp, uint256 streak)',
]);

// React hook for agent status
const useAgentStatus = (registryAddr: string, agentAddr: string) => {
  const [status, setStatus] = useState(null);
  
  useEffect(() => {
    const client = createPublicClient({
      chain: baseSepolia,
      transport: http('https://sepolia.base.org'),
    });
    
    const fetchStatus = async () => {
      const [alive, fullStatus] = await Promise.all([
        client.readContract({ address: registryAddr, abi: REGISTRY_ABI, functionName: 'isAlive', args: [agentAddr] }),
        client.readContract({ address: registryAddr, abi: REGISTRY_ABI, functionName: 'getAgentStatus', args: [agentAddr] }),
      ]);
      
      setStatus({
        isAlive: alive,
        lastPulseAt: new Date(Number(fullStatus.lastPulseAt) * 1000),
        streak: Number(fullStatus.streak),
        hazardScore: Number(fullStatus.hazardScore),
      });
    };
    
    fetchStatus();
    const interval = setInterval(fetchStatus, 5_000);
    return () => clearInterval(interval);
  }, [registryAddr, agentAddr]);
  
  return status;
};
```

### Recharts Metrics

```typescript
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';

// Pulse history over time
const PulseChart = ({ data }) => (
  <ResponsiveContainer width="100%" height={300}>
    <LineChart data={data}>
      <XAxis dataKey="time" />
      <YAxis />
      <Tooltip />
      <Line type="monotone" dataKey="pulseCount" stroke="#3B82F6" />
      <Line type="monotone" dataKey="activeAgents" stroke="#10B981" />
    </LineChart>
  </ResponsiveContainer>
);

// Agent streak comparison
const StreakChart = ({ agents }) => (
  <ResponsiveContainer width="100%" height={300}>
    <BarChart data={agents}>
      <XAxis dataKey="address" tickFormatter={(v) => v.slice(0, 6) + '...'} />
      <YAxis />
      <Tooltip />
      <Bar dataKey="streak" fill="#8B5CF6" />
    </BarChart>
  </ResponsiveContainer>
);
```

### Network Topology Layout

```typescript
// Simplified network graph using CSS grid + D3 force layout
import { useEffect, useRef } from 'react';
import * as d3 from 'd3';

const NetworkTopology = ({ agents, pulses }) => {
  const svgRef = useRef();
  
  useEffect(() => {
    // Create force simulation
    const simulation = d3.forceSimulation(agents)
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(400, 300))
      .force('link', d3.forceLink(pulses).id(d => d.address).distance(100));
    
    // Draw nodes (agents)
    const nodes = d3.select(svgRef.current)
      .selectAll('.agent')
      .data(agents)
      .join('circle')
      .attr('class', 'agent')
      .attr('r', d => 10 + d.streak * 2)
      .attr('fill', d => d.isAlive ? '#10B981' : '#EF4444')
      .call(d3.drag());
    
    // Draw links (pulse connections)
    const links = d3.select(svgRef.current)
      .selectAll('.pulse-link')
      .data(pulses)
      .join('line')
      .attr('class', 'pulse-link')
      .attr('stroke', '#3B82F6')
      .attr('stroke-width', 2);
    
    simulation.on('tick', () => {
      nodes.attr('cx', d => d.x).attr('cy', d => d.y);
      links
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);
    });
    
    return () => simulation.stop();
  }, [agents, pulses]);
  
  return <svg ref={svgRef} width={800} height={600} />;
};
```

---

## 7. 3-Mode Toggle Implementation

### Configuration Structure

```typescript
// config/chains.ts
export type NetworkMode = 'fork' | 'testnet' | 'mainnet';

interface ChainConfig {
  id: number;
  name: string;
  rpcUrl: string;
  explorerUrl: string;
  contracts: {
    pulseToken: string;
    pulseRegistry: string;
    signalSink: string;
  };
  tokenSymbol: string;
  blockTimeSeconds: number;
  isFork?: boolean;
}

const configs: Record<NetworkMode, ChainConfig> = {
  fork: {
    id: 8453,
    name: 'Base Fork',
    rpcUrl: 'http://LOCAL_NODE:8545',
    explorerUrl: 'http://LOCAL_NODE:8545', // Blockscout
    contracts: {
      pulseToken: process.env.FORK_TOKEN_ADDR || '',
      pulseRegistry: process.env.FORK_REGISTRY_ADDR || '',
      signalSink: '0x000000000000000000000000000000000000dEaD',
    },
    tokenSymbol: 'PULSE',
    blockTimeSeconds: 2,
    isFork: true,
  },
  testnet: {
    id: 84532,
    name: 'Base Sepolia',
    rpcUrl: 'https://sepolia.base.org',
    explorerUrl: 'https://sepolia.basescan.org',
    contracts: {
      pulseToken: process.env.TESTNET_TOKEN_ADDR || '',
      pulseRegistry: process.env.TESTNET_REGISTRY_ADDR || '',
      signalSink: '0x000000000000000000000000000000000000dEaD',
    },
    tokenSymbol: 'PULSE',
    blockTimeSeconds: 2,
  },
  mainnet: {
    id: 8453,
    name: 'Base Mainnet',
    rpcUrl: 'https://mainnet.base.org',
    explorerUrl: 'https://basescan.org',
    contracts: {
      pulseToken: process.env.MAINNET_TOKEN_ADDR || '',
      pulseRegistry: process.env.MAINNET_REGISTRY_ADDR || '',
      signalSink: '0x000000000000000000000000000000000000dEaD',
    },
    tokenSymbol: 'PULSE',
    blockTimeSeconds: 2,
  },
};
```

### Hot-Switching Without Reload

```typescript
// contexts/NetworkContext.tsx
import React, { createContext, useContext, useState, useCallback } from 'react';
import { createPublicClient, http } from 'viem';

interface NetworkContextType {
  mode: NetworkMode;
  config: ChainConfig;
  client: ReturnType<typeof createPublicClient>;
  switchMode: (newMode: NetworkMode) => void;
}

const NetworkContext = createContext<NetworkContextType | null>(null);

export const NetworkProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mode, setMode] = useState<NetworkMode>('fork');
  
  const config = configs[mode];
  
  const client = createPublicClient({
    chain: {
      id: config.id,
      name: config.name,
      nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
      rpcUrls: { default: { http: [config.rpcUrl] } },
    },
    transport: http(config.rpcUrl),
  });
  
  const switchMode = useCallback((newMode: NetworkMode) => {
    // Clear any cached data
    queryClient.clear();
    setMode(newMode);
  }, []);
  
  return (
    <NetworkContext.Provider value={{ mode, config, client, switchMode }}>
      {children}
    </NetworkContext.Provider>
  );
};

export const useNetwork = () => {
  const ctx = useContext(NetworkContext);
  if (!ctx) throw new Error('useNetwork must be used within NetworkProvider');
  return ctx;
};
```

### Mode Toggle UI

```typescript
// components/NetworkToggle.tsx
export const NetworkToggle = () => {
  const { mode, switchMode, config } = useNetwork();
  
  const modes: { key: NetworkMode; label: string; color: string }[] = [
    { key: 'fork', label: '🍴 Fork', color: 'bg-gray-600' },
    { key: 'testnet', label: '🧪 Testnet', color: 'bg-yellow-600' },
    { key: 'mainnet', label: '🔴 Mainnet', color: 'bg-green-600' },
  ];
  
  return (
    <div className="flex items-center gap-2 p-2 bg-gray-800 rounded-lg">
      {modes.map(({ key, label, color }) => (
        <button
          key={key}
          onClick={() => switchMode(key)}
          className={`px-3 py-1 rounded transition-colors ${
            mode === key ? color + ' text-white' : 'bg-gray-700 text-gray-400'
          }`}
        >
          {label}
        </button>
      ))}
      <div className="ml-4 text-sm text-gray-400">
        {config.name} | Chain ID: {config.id}
      </div>
    </div>
  );
};
```

### Contract Address Resolution

```typescript
// hooks/useContractAddress.ts
export const useContractAddress = (contractName: keyof ChainConfig['contracts']) => {
  const { config } = useNetwork();
  const address = config.contracts[contractName];
  
  if (!address) {
    throw new Error(`Contract ${contractName} not configured for ${config.name}`);
  }
  
  return address as `0x${string}`;
};

// Usage in components
const registryAddr = useContractAddress('pulseRegistry');
```

### Explorer Links

```typescript
// utils/explorer.ts
export const useExplorerUrl = () => {
  const { config } = useNetwork();
  
  return {
    tx: (hash: string) => `${config.explorerUrl}/tx/${hash}`,
    address: (addr: string) => `${config.explorerUrl}/address/${addr}`,
    block: (num: number) => `${config.explorerUrl}/block/${num}`,
  };
};

// Component usage
const explorer = useExplorerUrl();
<a href={explorer.tx(pulseTxHash)} target="_blank" rel="noopener">
  View on {config.name} Explorer →
</a>
```

### Token Label Adaptation

```typescript
// components/TokenBalance.tsx
export const TokenBalance = ({ amount }: { amount: bigint }) => {
  const { config } = useNetwork();
  const symbol = config.tokenSymbol;
  
  // Different precision for different modes
  const decimals = config.isFork ? 18 : 18;
  const formatted = formatUnits(amount, decimals);
  
  return (
    <span className="font-mono">
      {parseFloat(formatted).toFixed(2)} {symbol}
    </span>
  );
};
```

---

## Appendix A: Quick Reference Commands

```bash
# Start fork
anvil --fork-url https://mainnet.base.org --port 8545 --chain-id 8453

# Deploy to fork
DEPLOYER_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
RPC_URL=http://LOCAL_NODE:8545 \
CHAIN_ID=8453 \
npx tsx scripts/deploy-all.ts

# Deploy to testnet
DEPLOYER_PRIVATE_KEY=0x... \
RPC_URL=https://sepolia.base.org \
CHAIN_ID=84532 \
npx tsx scripts/deploy-all.ts

# Verify contract
forge verify-contract ${ADDR} PulseRegistry --chain 84532 \
  --constructor-args $(cast abi-encode "constructor(address,address,uint256,uint256)" ${TOKEN} ${SINK} 86400 1000000000000000000)

# Fund wallets on fork
curl -X POST http://LOCAL_NODE:8545 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"anvil_setBalance","params":["0x...", "0x3635c9adc5dea00000"],"id":1}'
```

## Appendix B: Environment Variables Template

```bash
# .env.local for dashboard
NEXT_PUBLIC_NETWORK_MODE=fork  # fork | testnet | mainnet

# Fork configuration
FORK_RPC_URL=http://LOCAL_NODE:8545
FORK_TOKEN_ADDR=0x...
FORK_REGISTRY_ADDR=0x...

# Testnet configuration  
TESTNET_RPC_URL=https://sepolia.base.org
TESTNET_TOKEN_ADDR=0x...
TESTNET_REGISTRY_ADDR=0x...

# Mainnet configuration
MAINNET_RPC_URL=https://mainnet.base.org
MAINNET_TOKEN_ADDR=0x...
MAINNET_REGISTRY_ADDR=0x...

# Common
NEXT_PUBLIC_SIGNAL_SINK=0x000000000000000000000000000000000000dEaD
NEXT_PUBLIC_EXPLORER_TX_BASE_URL=https://sepolia.basescan.org/tx/
```

---

*End of Technical Brief — Ready for Builder Implementation*
