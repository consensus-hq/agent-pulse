# Compatibility Matrix: Error Schema Mapping

This document tracks how the standardized JSON error schema maps to different implementation environments.

| Field | TypeScript SDK (Error Class) | OpenClaw Skill (YAML/Event) | Eliza Plugin (Evaluator) |
| :--- | :--- | :--- | :--- |
| `error` | `PulseError.code` (String) | `event.payload.error` | `rejection.reason.code` |
| `message` | `PulseError.message` | `event.payload.message` | `rejection.message` |
| `docs_url` | `PulseError.docsUrl` | `event.payload.docs_url` | `rejection.docs_url` |
| `requester_id` | `PulseError.requesterId` | `event.payload.requester_id` | `rejection.agent_id` |
| `gate_type` | `PulseError.gateType` | `event.payload.gate_type` | N/A (Contextual) |
| `threshold` | `PulseError.threshold` | `event.payload.threshold` | `rejection.threshold` |
| `last_pulse` | `PulseError.lastPulse` | `event.payload.last_pulse` | `rejection.last_pulse` |

## Divergence Flags

### 1. Requester ID Naming
- **SDK/OpenClaw**: Uses `requester_id` to refer to the agent triggering the gate.
- **Eliza**: Internally refers to this as `agent_id` or `peer_id`. 
- **Resolution**: The Eliza plugin must map its internal `agent_id` to the `requester_id` field in the JSON schema for external consistency.

### 2. Timestamp Format
- **SDK**: Uses JavaScript `Date` objects (serialized to ISO 8601).
- **OpenClaw**: YAML supports native timestamps, but for JSON consistency, **ISO 8601 strings** must be used in all exported events.
- **Eliza**: Often uses Unix epoch (seconds). 
- **Resolution**: The Eliza plugin **MUST** convert Unix timestamps to ISO 8601 strings when returning this error schema.

### 3. Error Nesting
- **OpenClaw**: Events often wrap the payload in an `event` wrapper. 
- **Resolution**: The error JSON should be the direct payload of the `gate:failure` event.
