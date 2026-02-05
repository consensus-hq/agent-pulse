# Agent Pulse — Demo Script

## Scene 1: The Problem (15s)
**[Terminal view]**

> AI agents are everywhere. But how do you know which ones are actually running?
> Anyone can claim to be "alive." On-chain proof costs nothing to fake if there's no cost.

## Scene 2: The Solution (20s)
**[Architecture diagram — text-based]**

```
Agent → POST /api/pulse → 402 Payment Required
     → Sign EIP-712 permit → Retry with payment
     → PULSE burns to 0xdEaD → Streak updates
     → isAlive(agent) = true ✓
```

> Agent Pulse: a public routing gate on Base. Agents pay 1 PULSE to signal liveness.
> No pulse within TTL → agent drops off. Simple. Deterministic. On-chain.

## Scene 3: Live Testnet Demo (30s)
**[Terminal: cast commands against Base Sepolia]**

```bash
# Check if agent is alive
cast call $REGISTRY "isAlive(address)" $AGENT --rpc-url $RPC

# Send a pulse (approve + pulse)
cast send $TOKEN "approve(address,uint256)" $REGISTRY 1000000000000000000 --rpc-url $RPC
cast send $REGISTRY "pulse(uint256)" 1000000000000000000 --rpc-url $RPC

# Verify: agent is now alive with streak=1
cast call $REGISTRY "getAgentStatus(address)" $AGENT --rpc-url $RPC
```

> One transaction. Agent is routable. Streak starts counting.

## Scene 4: API Layer (15s)
**[Terminal: curl commands]**

```bash
# Machine-readable status endpoint
curl https://agent-pulse-nine.vercel.app/api/status/0x9508...

# Response: { isAlive: true, streak: 1, source: "chain", hazardScore: 0 }
```

> Built for AI agents, not humans. JSON APIs over dashboards.
> KV cache for sub-second reads, chain fallback for truth.

## Scene 5: x402 Micropayments (15s)
**[Code snippet]**

```typescript
import { sendPulse } from '@/lib/pulse-client';

// Agent-side: one function call
const result = await sendPulse(agentAddress, privateKey, baseUrl);
// 402 → sign → pay → burn → done
```

> x402 protocol: HTTP-native payments. No separate approval flow.
> HeyElsa DeFi integration for token data and portfolio queries.

## Scene 6: Security (10s)
**[Test output]**

```
73/73 Foundry tests passing
56/56 Vitest integration tests
2 pentest rounds + 5 red-team agents
0 critical/high findings remaining
```

> 66 PRs merged. Production architecture: thirdweb SDK, Vercel KV, no mocks.

## Scene 7: Closing (15s)
**[Terminal]**

> Agent Pulse. Paid eligibility for AI agents on Base.
> Open source. Composable. Built by Connie — an AI agent building tools for AI agents.

---

**Total runtime: ~2 minutes**
**Tone: Terminal/engineer aesthetic. No fluff. Show the code.**
