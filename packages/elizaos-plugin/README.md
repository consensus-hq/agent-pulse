# @openclaw/eliza-plugin-pulse

ElizaOS plugin for the [Agent Pulse](https://agentpulse.io) protocol with **gate functionality** for secure agent-to-agent interactions.

## Overview

Agent Pulse is a decentralized liveness protocol where agents prove they're alive by transferring PULSE tokens to a signal sink. This plugin extends the base functionality with **gate capabilities** that validate incoming/outgoing interactions based on on-chain liveness signals.

### Features

- ✅ **Standard Pulse Actions**: Send pulses, check status, monitor protocol health
- 🔒 **Inbound Gate**: Validates incoming messages from external agents before processing
- 🚪 **Outbound Gate**: Checks target agent status before sending responses
- 📊 **v2 Analytics**: Reliability metrics, liveness proofs, global stats, peer correlation
- ⚙️ **Multiple Modes**: Strict, permissive, and audit modes for different security needs

## Installation

```bash
npm install @openclaw/eliza-plugin-pulse
```

## Quick Start

### 1. Add to Your Character File

```json
{
  "name": "MyAgent",
  "plugins": ["@openclaw/eliza-plugin-pulse"],
  "settings": {
    "pulse": {
      "gate": {
        "enabled": true,
        "mode": "strict",
        "threshold": "24h"
      },
      "contractAddress": "0x2C802988c16Fae08bf04656fe93aDFA9a5bA8612",
      "chainId": 84532
    }
  }
}
```

### 2. Environment Variables (Optional)

```bash
AGENT_PULSE_RPC_URL=https://sepolia.base.org
AGENT_PULSE_API_URL=https://api.agentpulse.io
AGENT_PULSE_TOKEN_ADDRESS=0x7f24C286872c9594499CD634c7Cc7735551242a2
AGENT_PULSE_REGISTRY_ADDRESS=0x2C802988c16Fae08bf04656fe93aDFA9a5bA8612
```

## Gate Configuration

The gate reads configuration from `character.settings.pulse`:

```json
{
  "settings": {
    "pulse": {
      "gate": {
        "enabled": true,      // Enable/disable the gate
        "mode": "strict",     // "strict" | "permissive" | "audit"
        "threshold": "24h"    // Max age for considering agent alive
      },
      "contractAddress": "0x2C802988c16Fae08bf04656fe93aDFA9a5bA8612",
      "chainId": 84532,
      "rpcUrl": "https://sepolia.base.org"  // Optional override
    }
  }
}
```

### Gate Modes

| Mode | Behavior | Use Case |
|------|----------|----------|
| `strict` | Block messages from agents that fail `isAlive()` check | High-security environments |
| `permissive` | Allow all messages, flag suspicious ones with warnings | Balanced security/UX |
| `audit` | Always allow, log all checks (dry-run) | Testing and monitoring |

### Threshold Format

The threshold accepts ISO 8601 duration formats:

- `"24h"` - 24 hours
- `"1d"` - 1 day  
- `"12h"` - 12 hours
- `"PT6H"` - 6 hours (ISO format)

## How the Gate Works

### Inbound Gate (Evaluator)

Runs **before all other evaluators** for every message:

1. **Identity Extraction**: Extracts sender's Ethereum address from:
   - Message text (e.g., "I'm agent 0x1234...")
   - User metadata
   - Sender ID (if it looks like an address)

2. **Agent Detection**: Determines if sender is likely an agent using heuristics:
   - Contains Ethereum addresses
   - Agent-specific keywords (pulse, stake, smart contract)
   - Agent-like metadata markers

3. **IsAlive Check**: Calls Pulse API to verify:
   - Is the agent registered?
   - When was the last pulse?
   - Is it within the threshold?

4. **Decision**: Based on mode:
   - `strict`: Block if not alive
   - `permissive`: Allow but flag
   - `audit`: Allow and log

### Outbound Gate (Action Wrapper)

Wraps all action handlers to check target agents:

1. **Target Extraction**: Identifies recipient from:
   - Action options (`targetAddress`)
   - State from inbound gate (replying to an agent)
   - Message content

2. **Status Check**: Verifies target's liveness

3. **Action Control**: Blocks or proceeds based on decision

## Edge Cases

The gate handles these scenarios gracefully:

| Scenario | Behavior |
|----------|----------|
| **No pulse settings** | Gate is no-op (disabled), all interactions allowed |
| **RPC unreachable** | Degrades per mode: strict=block, permissive/audit=allow |
| **Non-agent user** | Skips gate entirely (humans pass through) |
| **No identity found** | strict=block, others=skip |
| **Agent never pulsed** | Treated as not alive (fails check) |
| **Cache expired** | Re-checks status with 1-minute caching |

## Example Character

See [example-gated-character.json](./example-gated-character.json) for a complete example of an agent configured with:

- Strict gate mode enabled
- 24-hour liveness threshold
- Security-focused personality
- Helpful responses for verified agents

## Actions

### SEND_PULSE
Send a liveness pulse to prove the agent is alive.

```
User: "Send a pulse for my agent"
Agent: "✅ Pulse sent successfully! Transaction: 0xabc... Streak: 5"
```

### GET_AGENT_STATUS
Get the current status of an agent.

```
User: "Check my agent status"
Agent: "**Agent Status: 0x742d...0bEb**
🟢 Alive
• Last Pulse: 2 hours ago
• Streak: 🔥 5 days
• Hazard Score: ✅ 0/100"
```

### GET_RELIABILITY (v2 - Paid)
Get comprehensive reliability metrics.

```
User: "Check reliability"
Agent: "Agent reliability: 92.3%
Uptime: 99.1%
Jitter: 0.08
Hazard Rate: 0.02"
```

**Price:** $0.01 USDC

### GET_LIVENESS_PROOF (v2 - Paid)
Get a cryptographically signed proof of liveness.

```
User: "Get liveness proof"
Agent: "✅ Alive | Proof: eyJhbG..."
```

**Price:** $0.005 USDC

### GET_GLOBAL_STATS (v2 - Paid)
Get network-wide aggregate statistics.

```
User: "Show network stats"
Agent: "Active Agents: 1,500
Average Streak: 30.5 days
Network Health: ✅ Healthy"
```

**Price:** $0.03 USDC

### GET_PEER_CORRELATION (v2 - Paid)
Find agents with correlated liveness patterns.

```
User: "Find similar agents"
Agent: "Correlation: 0.78
Similar agents: 2 found
Cluster: copywriters-west"
```

**Price:** $0.02 USDC

## Providers

### PULSE_STATE
Provides current state from the Agent Pulse protocol:

```
Agent Pulse Protocol:
Protocol: ✅ HEALTHY | 1,234 agents
Agent: 🟢 Alive | 🔥 5 | 2h ago
TTL: 24h | Min pulse: 1 PULSE
```

## Programmatic Usage

### Check if an Agent is Alive

```typescript
import { isAlive, getPulseGateSettings } from "@openclaw/eliza-plugin-pulse";

const settings = getPulseGateSettings(runtime);
if (settings) {
  const result = await isAlive(
    "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
    settings,
    runtime
  );

  console.log(result.allowed);  // true/false
  console.log(result.reason);   // Explanation if not allowed
  console.log(result.status);   // Full status object
}
```

### Extract Identity from Message

```typescript
import { extractIdentity, isLikelyAgent } from "@openclaw/eliza-plugin-pulse";

const identity = extractIdentity(message, runtime);
if (identity.found) {
  console.log(identity.address);  // Ethereum address
  console.log(identity.source);   // "signature" | "claimed" | "inferred"
}

const isAgent = isLikelyAgent(message, runtime);
```

### Manual Gate Check

```typescript
import { makeGateDecision } from "@openclaw/eliza-plugin-pulse";

const decision = makeGateDecision(
  "strict",           // mode
  checkResult,        // GateCheckResult from isAlive()
  identity            // ExtractedIdentity
);

console.log(decision.allow);  // true/false
console.log(decision.flag);   // true/false
console.log(decision.log);    // true/false
```

## Contract Addresses

**Base Sepolia (Chain ID: 84532)**
- PulseRegistry: `0x2C802988c16Fae08bf04656fe93aDFA9a5bA8612`
- PulseToken: `0x7f24C286872c9594499CD634c7Cc7735551242a2`

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Type check
npm run typecheck

# Watch mode
npm run dev
```

## License

MIT
