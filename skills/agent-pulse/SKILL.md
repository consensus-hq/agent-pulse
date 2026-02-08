# OpenClaw Skill - AgentPulse Gate Integration

This OpenClaw skill integrates the AgentPulse SDK for bidirectional gating of agent interactions. It provides liveness verification before allowing skill actions to proceed.

## Overview

The AgentPulse Gate skill enables OpenClaw agents to:

1. **Verify agent liveness** before processing incoming requests
2. **Check target agent status** before making outgoing calls
3. **Enforce gating policies** based on configurable modes
4. **Surface gate status** in orchestrator queries

## Configuration

Add a `gate` block to your skill YAML configuration:

```yaml
gate:
  enabled: true
  mode: strict      # strict | warn | log
  threshold: 24h    # duration string (e.g., 30m, 1h, 24h, 7d)
  chainId: 84532    # optional: Base Sepolia (default) or 8453 for Base Mainnet
  rpcUrl: https://... # optional: custom RPC endpoint
```

### Gate Modes

| Mode | Behavior |
|------|----------|
| `strict` | Reject requests from/to dead agents with hard error |
| `warn` | Allow all requests, log warnings for dead agents |
| `log` | Passive telemetry only, no enforcement |

### Threshold Format

The `threshold` field accepts duration strings:
- `30m` - 30 minutes
- `1h` - 1 hour
- `24h` - 24 hours
- `1d` - 1 day
- `7d` - 7 days

## Skill Startup Hook

The skill automatically initializes the AgentPulse SDK on startup:

1. Reads gate configuration from skill YAML
2. Validates configuration against `gate-schema.json`
3. Initializes AgentPulseClient with provided settings
4. Creates AgentPulseGate instance with configured mode
5. **Gate failure is surfaced** - if RPC is unreachable, skill errors per mode

### Mode Mapping

| Mode | Gate Configuration |
|------|-------------------|
| `strict` | `gateIncoming` + `gateOutgoing` with hard reject |
| `warn` | Gates enabled, warnings logged, requests proceed |
| `log` | Passive telemetry, all requests proceed |

## Gate Activation Order

```
1. Skill Startup
   └── Initialize AgentPulse SDK
       └── Fail loudly if RPC unreachable (strict/warn)

2. Incoming Request
   └── gateIncoming(requesterAddr)
       ├── strict: reject if dead → throw error
       ├── warn: log warning if dead → proceed
       └── log: log status → proceed

3. Execute Skill Action/Evaluator

4. Outgoing Request (if applicable)
   └── gateOutgoing(targetAddr)
       └── Same behavior as incoming
```

## Status Output

The skill adds a `gate` section to skill status for orchestrator queries:

```json
{
  "gate": {
    "enabled": true,
    "mode": "strict",
    "threshold": "24h",
    "status": "active",
    "lastCheck": 1707254400,
    "agentsChecked": 42,
    "agentsRejected": 3
  }
}
```

## API

### `gateIncoming(requesterAddr: Address): Promise<boolean>`

Check if an incoming request from `requesterAddr` should be allowed.

- Returns `true` if allowed
- Throws `AgentPulseError` in strict mode if agent is dead
- Logs and returns `true` in warn/log modes

### `gateOutgoing(targetAddr: Address): Promise<boolean>`

Check if an outgoing request to `targetAddr` should be allowed.

- Same behavior as `gateIncoming`

### `getGateStatus(): GateStatus`

Get current gate status for monitoring.

## CLI Commands

The skill provides shell scripts for CLI interaction with the AgentPulse protocol:

| Command | Usage | Description |
|---------|-------|-------------|
| `attest.sh` | `./attest.sh <addr> <outcome> [--task-id <id>]` | Submit a peer attestation |
| `reputation.sh` | `./reputation.sh <addr> [--format json]` | Show composite reputation score and stats |
| `check.sh` | `./check.sh <addr> --min-score <n>` | Verify if an agent meets a reputation threshold |
| `attestations.sh` | `./attestations.sh <addr> --received\|--given` | List historical attestations |

Note: In the final distribution, these are aliased to `agent-pulse <command>`.

## Error Handling

If the AgentPulse SDK fails to initialize (bad RPC, network issues):

- **strict mode**: Skill startup fails with error
- **warn mode**: Warning logged, skill continues without gating
- **log mode**: Silent failure, passive mode disabled

## Integration Example

See `example-gated-skill.yaml` for complete configuration examples.

## Dependencies

- `@agent-pulse/sdk` - AgentPulse protocol SDK
- `viem` - Ethereum interactions
