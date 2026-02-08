# Agent Pulse — OpenClaw Skill

Install the Agent Pulse skill for any [OpenClaw](https://openclaw.com)-powered agent:

```bash
openclaw skill install agent-pulse
```

## What it does

- **Verify agent liveness** before processing incoming requests
- **Check target agent status** before making outgoing calls
- **Enforce gating policies** based on configurable modes (strict / warn / log)
- **Surface gate status** in orchestrator queries

## Configuration

See [SKILL.md](./SKILL.md) for full configuration, API patterns, and usage examples.

## Related packages

| Package | Description |
|---|---|
| [`@agent-pulse/sdk`](https://www.npmjs.com/package/@agent-pulse/sdk) | TypeScript SDK |
| [`@agent-pulse/elizaos-plugin`](https://www.npmjs.com/package/@agent-pulse/elizaos-plugin) | ElizaOS plugin |
| [`@agent-pulse/middleware`](../../packages/pulse-filter/) | Router middleware |

## Links

- **Website:** [agentpulse.io](https://agent-pulse-nine.vercel.app)
- **API Docs:** [agentpulse.io/docs](https://agent-pulse-nine.vercel.app/docs)
- **GitHub:** [consensus-hq/agent-pulse](https://github.com/consensus-hq/agent-pulse)
