# Time Manipulation Feature for Agent Pulse Dashboard

This document describes the time manipulation feature added to the Agent Pulse verification dashboard, enabling real-time state changes on an Anvil fork via RPC calls.

## Overview

The dashboard now supports a "Time Manipulation Mode" when running in fork mode with an accessible Anvil instance. This mode allows users to:

- Scrub through time (0-7 days) using a slider
- Observe real-time changes to agent states (alive/dead/expiring)
- Visualize TTL countdowns and streak/hazard metrics
- Automatically mine blocks as time advances

## Architecture

### 1. API Route: `/api/anvil`

**File:** `apps/web/src/app/api/anvil/route.ts`

A Next.js API route that proxies JSON-RPC calls to the local Anvil instance:

| Method | Description |
|--------|-------------|
| `evm_snapshot` | Takes a blockchain snapshot, yields snapshot ID |
| `evm_revert` | Reverts blockchain to a snapshot ID |
| `evm_increaseTime` | Advances block timestamp by N seconds |
| `evm_mine` | Mines a new block |
| `evm_setNextBlockTimestamp` | Sets exact timestamp for next block |
| `eth_blockNumber` | Gets current block number |

The route forwards requests to `NEXT_PUBLIC_FORK_RPC_URL` (default: local Anvil at port 8546).

### 2. React Hook: `useAnvilTimeControl`

**File:** `apps/web/src/hooks/useAnvilTimeControl.ts`

Provides time manipulation functionality:

```typescript
{
  snapshot: () => Promise<string>
  revert: (id: string) => Promise<void>
  advanceTime: (seconds: number) => Promise<void>
  setTime: (timestamp: number) => Promise<void>
  currentTimestamp: number | null
  refresh: () => Promise<void>
  isAvailable: boolean
  isLoading: boolean
  issueMessage: string | null
}
```

### 3. Modified Verify Page

**File:** `apps/web/src/app/verify/page.tsx`

Key enhancements:

#### Time Manipulation Mode
- Automatically activates when in "fork" mode with Anvil reachable
- Takes a baseline snapshot on initialization
- Slider maps to time offsets (0-7 days in configurable steps)
- Supports 1h, 6h, and 24h time step increments

#### Slider Behavior
- **Forward movement**: Calls `evm_increaseTime(delta)` + `evm_mine`
- **Backward movement**: Reverts to baseline snapshot, then advances to new position
- **Auto-play**: Automatically advances time steps when playing

#### Live Contract State Reading
After each time change, the dashboard reads from the PulseRegistry contract:

```solidity
function isAlive(address agent) external view yields (bool)
function getAgentStatus(address agent) external view yields (
    bool alive,
    uint256 lastPulseAt,
    uint256 streak,
    uint256 hazardScore
)
```

### 4. Visual Updates

**File:** `apps/web/src/app/verify/verify.module.css`

New CSS classes for agent states:

| Class | Description |
|-------|-------------|
| `.nodeAgentAlive` | Green pulsing node - agent is alive |
| `.nodeAgentExpiring` | Yellow pulsing node - TTL < 2 hours |
| `.nodeAgentDead` | Red node - agent has expired |
| `.timeDisplay` | Simulated time display above slider |
| `.timeStepControls` | Time step selector (1h/6h/24h) |
| `.agentStatusBadge` | Status indicator per agent |

## Network Topology Visualization

Agent nodes now show:
- **Color**: Green (alive), Yellow (expiring soon), Red (expired)
- **TTL indicator**: Shows remaining time below each agent node
- **Pulse animation**: Living agents have a subtle pulse effect

## Agent Status Table

A new table displays live contract data for all agents:
- Wallet address
- Alive/Expired status
- Current streak
- Hazard score
- TTL remaining (with warning color if < 2h)

## Metrics Panel

Additional metric card showing count of alive agents (visible in time mode).

## Graceful Degradation

If Anvil is not reachable:
- Dashboard falls back to static replay mode
- Existing functionality continues to work
- No messages shown to user (silent fallback)

## Environment Variables

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_FORK_RPC_URL` | Anvil RPC endpoint (default: port 8545 on local machine) |
| `NEXT_PUBLIC_FORK_REGISTRY_ADDRESS` | PulseRegistry contract on fork |
| `NEXT_PUBLIC_FORK_TOKEN_ADDRESS` | PulseToken contract on fork |
| `NEXT_PUBLIC_VERIFY_LOG_FORK_URL` | URL to verification log JSON |

## Usage

1. Start Anvil fork with deployed contracts
2. Set environment variables
3. Open dashboard in fork mode
4. Time manipulation mode activates automatically
5. Use slider to scrub through time
6. Observe agent states change in real-time

## Technical Details

- Uses `viem` for contract reads
- Time calculations assume 24-hour TTL from last pulse
- Maximum simulation range: 7 days (168 hours)
- Backward movement requires snapshot revert (consumes snapshot)
- Snapshots are re-taken after each revert
