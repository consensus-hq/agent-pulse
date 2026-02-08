# @agent-pulse/openclaw-skill

OpenClaw skill integration for [AgentPulse SDK](https://www.npmjs.com/package/@agent-pulse/sdk) gating. Provides liveness-based gate checks for incoming and outgoing agent requests.

## Install

```bash
npm install @agent-pulse/openclaw-skill @agent-pulse/sdk
```

## Usage

```typescript
import { startup, withGate, getGateStatus } from "@agent-pulse/openclaw-skill";

// Initialize gate from skill YAML config
const result = await startup({
  enabled: true,
  mode: "strict",       // "strict" | "warn" | "log"
  threshold: "24h",     // liveness threshold
  chainId: 84532,       // Base Sepolia (default)
});

if (result.success && result.gate) {
  // Gate an incoming request
  const allowed = await result.gate.gateIncoming("0x...");

  // Or use the middleware wrapper
  const protectedAction = withGate(async (ctx, input) => {
    // your action logic
  });
}
```

## Gate Modes

| Mode     | On Reject           | On Error            |
|----------|---------------------|---------------------|
| `strict` | Throws error (403)  | Throws error (500)  |
| `warn`   | Logs warning        | Logs, allows        |
| `log`    | Telemetry only      | Silent, allows      |

## Links

- [AgentPulse SDK](https://www.npmjs.com/package/@agent-pulse/sdk)
- [Repository](https://github.com/consensus-hq/agent-pulse)

## License

MIT
