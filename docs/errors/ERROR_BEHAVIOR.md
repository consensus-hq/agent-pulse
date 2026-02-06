# Error Behavior Specification

The Agent Pulse Gate system supports three distinct enforcement modes. These modes determine how errors (specifically `PULSE_REQUIRED`) are handled during a request lifecycle.

## Modes

### 1. `strict`
This is the default production mode. It prioritizes security and protocol compliance.
- **Action**: Intercepts the request/response and blocks it.
- **HTTP Status**: `403 Forbidden`
- **Response Body**: Returns the structured JSON error object (per schema).
- **Impact**: The underlying agent action or communication is **halted**.

### 2. `warn`
Used during transitions or for non-critical monitoring.
- **Action**: Allows the request/response to proceed but attaches metadata.
- **Mechanism**: 
  - **HTTP**: Adds an `X-AgentPulse-Error` header containing a stringified/base64 version of the error JSON.
  - **SDK**: Emits a warning event or includes error details in a `metadata` field of the result.
- **Impact**: The action **proceeds**, but the client is notified of the violation.

### 3. `log`
Used for data gathering and silent auditing.
- **Action**: No interference with the request/response.
- **Mechanism**: Emits a structured log event to the configured logger (e.g., stdout, File, or centralized logging service).
- **Impact**: The action **proceeds** with no external indication of the error.

---

## Error Handling Matrix

| Error Type | `strict` | `warn` | `log` |
| :--- | :--- | :--- | :--- |
| `PULSE_REQUIRED` | Block (403) | Header + Proceed | Log Only |
| `GATE_INIT_FAILED` | Fail Startup | Log + Disable Gate | Log Only |
| `REGISTRY_UNREACHABLE` | Block (Safe-Fail) | Header + Proceed | Log Only |
| `INVALID_AGENT_ID` | Block (400/403) | Header + Proceed | Log Only |
