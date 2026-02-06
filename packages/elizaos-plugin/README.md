# Agent Pulse ElizaOS Plugin

ElizaOS plugin for the [Agent Pulse](https://agentpulse.io) protocol - an on-chain liveness signal protocol on Base where agents transfer PULSE tokens to a dead address to prove they are alive.

## Overview

Agent Pulse is a decentralized liveness protocol that requires agents to periodically send "pulses" by burning PULSE tokens. This proves the agent is still operational and maintains a "streak" of consecutive daily pulses.

**Key Features:**
- Send liveness pulses (transfer PULSE tokens to signal sink)
- Check agent status (alive/dead, streak, hazard score)
- Get protocol configuration and health
- Automatic state tracking

## Installation

```bash
npm install @agent-pulse/elizaos-plugin
```

## Configuration

Add to your ElizaOS agent configuration:

```typescript
import agentPulsePlugin from "@agent-pulse/elizaos-plugin";

export default {
  plugins: [agentPulsePlugin],
  settings: {
    // Required
    AGENT_PULSE_API_URL: "https://api.agentpulse.io",
    
    // Optional (defaults shown)
    AGENT_PULSE_RPC_URL: "https://sepolia.base.org",
    AGENT_PULSE_CHAIN_ID: "84532",
    AGENT_PULSE_TOKEN_ADDRESS: "0x7f24C286872c9594499CD634c7Cc7735551242a2",
    AGENT_PULSE_REGISTRY_ADDRESS: "0x2C802988c16Fae08bf04656fe93aDFA9a5bA8612",
    AGENT_PULSE_DEFAULT_AMOUNT: "1000000000000000000", // 1 PULSE
    AGENT_PULSE_X402_ENABLED: "true",
  },
};
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `AGENT_PULSE_RPC_URL` | Base Sepolia RPC endpoint | `https://sepolia.base.org` |
| `AGENT_PULSE_API_URL` | Agent Pulse API base URL | `https://api.agentpulse.io` |
| `AGENT_PULSE_TOKEN_ADDRESS` | PULSE token contract | `0x7f24...242a2` |
| `AGENT_PULSE_REGISTRY_ADDRESS` | PulseRegistry contract | `0x2C80...8612` |
| `AGENT_PULSE_DEFAULT_AMOUNT` | Default pulse amount (wei) | `1000000000000000000` |
| `AGENT_PULSE_CHAIN_ID` | Chain ID | `84532` |
| `AGENT_PULSE_PRIVATE_KEY` | Signing key (optional) | - |
| `AGENT_PULSE_X402_ENABLED` | Enable x402 payments | `true` |
| `AGENT_PULSE_X402_FACILITATOR` | x402 facilitator URL | - |

## Actions

### SEND_PULSE

Send a liveness pulse to prove the agent is alive.

```
User: "Send a pulse for my agent"
Agent: "Successfully sent pulse. Transaction: 0xabc... Streak: 5"
```

**Parameters:**
- `agentAddress`: Ethereum address of the agent
- `amount`: Amount in wei (default: 1e18 = 1 PULSE)

**Similes:** `PULSE`, `HEARTBEAT`, `SIGNAL_ALIVE`, `CHECK_IN`, `STAY_ALIVE`, `BURN_PULSE`, `PROVE_LIVENESS`

### GET_AGENT_STATUS

Get the current status of an agent.

```
User: "Check my agent status"
Agent: "Agent status: Alive ✅
        Last pulse: 2 hours ago
        Streak: 5 days
        Hazard: 0/100"
```

**Returns:**
- `alive`: Whether agent is within TTL
- `lastPulse`: Unix timestamp of last pulse
- `streak`: Consecutive days with pulses
- `hazardScore`: 0-100 risk score
- `ttlSeconds`: TTL before considered dead

**Similes:** `CHECK_STATUS`, `GET_AGENT_STATUS`, `STATUS_CHECK`, `AM_I_ALIVE`, `PULSE_STATUS`, `AGENT_HEALTH`, `LIVENESS_CHECK`, `STREAK_STATUS`

### GET_PROTOCOL_CONFIG

Get protocol configuration.

```
User: "Show protocol config"
Agent: "Network: Base Sepolia (84532)
        PulseToken: 0x7f24...
        Registry: 0x2C80..."
```

**Returns:**
- Network configuration
- Contract addresses
- x402 settings
- Protocol parameters (TTL, min pulse amount)

### GET_PROTOCOL_HEALTH

Get protocol health status.

```
User: "Check protocol health"
Agent: "Protocol Health: ✅ Healthy
        Total Agents: 1,234
        Status: Active"
```

**Returns:**
- `paused`: Whether protocol is paused
- `totalAgents`: Number of registered agents
- `health`: Overall health status
- Service health flags

## Providers

### PULSE_STATE

Provides current state from the Agent Pulse protocol:

```
Agent Pulse Protocol:
Protocol: ✅ HEALTHY | 1,234 agents
Agent: 🟢 Alive | 🔥 5 | 2h ago
TTL: 24h | Min pulse: 1 PULSE
```

The provider automatically fetches and formats:
- Protocol health status
- Agent liveness (if AGENT_ADDRESS is set)
- TTL and minimum pulse requirements

## Contract Addresses

**Base Sepolia:**
- PulseToken: `0x7f24C286872c9594499CD634c7Cc7735551242a2`
- PulseRegistry: `0x2C802988c16Fae08bf04656fe93aDFA9a5bA8612`

## Protocol Mechanics

### Liveness

Agents are considered "alive" if their last pulse is within the TTL (default: 24 hours).

### Streaks

Consecutive daily pulses build a streak:
- Pulse on day N and N+1 → streak increases
- Miss a day → streak resets to 1
- Multiple pulses same day → streak unchanged

### Hazard Score

0-100 score managed by protocol owner indicating agent risk level.

## API Endpoints

The plugin interacts with these REST endpoints:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/pulse` | POST | Send pulse (x402 gated) |
| `/api/status/:address` | GET | Get agent status |
| `/api/config` | GET | Get protocol config |
| `/api/protocol-health` | GET | Get health status |

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