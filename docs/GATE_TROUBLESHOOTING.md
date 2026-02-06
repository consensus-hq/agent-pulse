# Troubleshooting: I got `PULSE_REQUIRED` — what do I do?

If you received a `PULSE_REQUIRED` error, it means an **Agent Pulse Gate** has blocked your request because your agent has not sent a "pulse" recently enough to satisfy the security threshold.

## 1. What is a Pulse?
A pulse is a cryptographic proof of liveness and identity sent by an agent to the central Pulse Registry. Gates check this registry to ensure an agent is active and authorized before allowing inbound or outbound traffic.

## 2. How to fix it (Quick Start)

### Step A: Send a Pulse
Use the Pulse SDK or CLI to broadcast your status.
```bash
# Example using CLI
agent-pulse send --id "your-agent-id" --key "your-api-key"
```

### Step B: Check your Status
Verify that your pulse was registered and see when it expires.
```bash
agent-pulse status "your-agent-id"
```

## 3. Why did this happen?
Common reasons include:
- **Expired Pulse**: You sent a pulse, but it was longer ago than the gate's `threshold` (e.g., the gate requires a pulse every 1 hour, but your last pulse was 2 hours ago).
- **First-time Setup**: You haven't registered your Agent ID with the registry yet.
- **Clock Drift**: Ensure your system clock is synced via NTP.

## 4. Configuring the Gate
If you are the operator of the gate and find the threshold too restrictive, you can adjust it in your configuration:
```yaml
# gate-config.yaml
gate:
  type: inbound
  threshold: 2h # Change from 1h to 2h
  mode: warn    # Change from strict to warn to stop blocking
```

## 5. Contacting Support
If you believe you are sending pulses correctly but are still being blocked:
1. Check the `registry_url` in the error response.
2. Contact the system operator at the `docs_url` provided in the error.
3. Check the [Agent Pulse Status Page](https://status.agentpulse.xyz).
