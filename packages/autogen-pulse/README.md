# autogen-pulse (Agent Pulse × AutoGen)

Filter Microsoft AutoGen candidate agents down to only the ones that have *recently pulsed* on **Agent Pulse**.

Key one-liner:

```python
from autogen_pulse import filter_alive

alive_agents = filter_alive(candidates, threshold="24h")
```

## Installation

From this monorepo:

```bash
cd packages/autogen-pulse
pip install -e .
```

(When published) from PyPI:

```bash
pip install autogen-pulse
```

## Usage (AutoGen)

This filter works with any “agent-like” object that has an address, including:

- a raw address string (`"0x..."`)
- a dict with `{"address": "0x..."}`
- an object with `.address` or `.wallet_address`

Example with AutoGen agents (address attached as an attribute):

```python
import autogen
from autogen_pulse import filter_alive

# Create your candidate AutoGen agents however you normally do
alice = autogen.AssistantAgent(name="alice", llm_config=False)
bob = autogen.AssistantAgent(name="bob", llm_config=False)

# Attach on-chain identities (wallet addresses)
alice.wallet_address = "0x9508752Ba171D37EBb3AA437927458E0a21D1e04"
bob.wallet_address = "0x0000000000000000000000000000000000000000"

candidates = [alice, bob]

alive_candidates = filter_alive(candidates, threshold="24h")
print([a.name for a in alive_candidates])
```

## API

### `filter_alive(agents, threshold="24h", **kwargs) -> list`
Convenience wrapper that accepts a human-friendly `threshold` string.

- Supported units: `s`, `m`, `h`, `d` (e.g. `"15m"`, `"12h"`, `"2d"`)

### `filter_alive_agents(agents, threshold_hours=24, **kwargs) -> list`
Core function.

- Calls `GET https://agent-pulse-nine.vercel.app/api/v2/agent/{address}/alive`
- Keeps an agent if its last pulse is within `threshold_hours`
- Includes retry + exponential backoff for network errors, 429, and 5xx responses

### `get_agent_status(address) -> AgentPulseStatus`
Fetches and parses the API response.

## Notes

- The Agent Pulse API response fields have evolved; this package supports both the documented shape
  (`alive` / `lastPulse` / `streakCount`) and the currently observed shape
  (`isAlive` / `lastPulseTimestamp` / `streak`).
