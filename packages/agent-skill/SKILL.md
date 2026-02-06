---
name: agent-pulse
description: Send and verify on-chain liveness “pulses” for autonomous agents on Base Sepolia via the Agent Pulse API (x402 paid) or directly via the PulseRegistry contract.
metadata: {
  "clawdbot": {
    "emoji": "💓",
    "requires": {"bins": ["curl", "cast"]},
    "allowedTools": ["exec", "read", "write", "edit", "web_fetch", "web_search"]
  }
}
---

# Agent Pulse (💓)

Agent Pulse is a liveness signaling protocol: an agent periodically sends a **pulse** by paying/burning **PULSE** tokens. Observers can read status (alive/streak/lastPulse/hazard/TTL).

**Network:** Base Sepolia (chainId **84532**)

- PulseToken: `0x7f24C286872c9594499CD634c7Cc7735551242a2`
- PulseRegistry: `0x2C802988c16Fae08bf04656fe93aDFA9a5bA8612`
- API: `https://agent-pulse-nine.vercel.app`

> Important: $PULSE is a **utility token** used to send pulse signals. Avoid language suggesting financial upside.

## When to use this skill

Use this skill when you need to:

- **Send a pulse** (paid): prove an agent is alive by burning PULSE.
- **Check a specific agent’s liveness**: verify whether they’re currently alive (TTL-based) and see streak and last pulse.
- **Check protocol configuration**: confirm addresses, network, and x402 requirements.
- **Check protocol health**: see whether the protocol is paused and overall health.

## Decision tree (pick the right action)

1) Do you need to **send a pulse**?
- Yes → `scripts/pulse.sh`
  - Prefer **API mode** if the environment has an **x402 payment header** available.
  - Use **direct on-chain mode** if you have RPC + key and want to bypass HTTP.

2) Do you just need read-only information?
- Agent-specific status → `scripts/status.sh <agentAddress>`
- Protocol config → `scripts/config.sh`
- Protocol health → `scripts/health.sh`

3) Are API calls failing but you still need authoritative state?
- Use `cast call` against PulseRegistry for `isAlive()` / `getAgentStatus()`.

## Quickstart

### Read-only (no auth)

```bash
{baseDir}/scripts/config.sh
{baseDir}/scripts/health.sh
{baseDir}/scripts/status.sh 0xYourAgentAddress
```

### Send a pulse (API / x402)

This endpoint is **x402 gated**. Provide an EVM payment header that pays **1 PULSE** to `0xdEaD`.

```bash
# Required env var (provided by your x402 client / payment middleware)
export X402_PAYMENT_HEADER='...'

{baseDir}/scripts/pulse.sh 0xYourAgentAddress 1000000000000000000
```

### Send a pulse (direct on-chain)

If you have an RPC URL and a private key available, you can call the contract directly.

```bash
export BASE_SEPOLIA_RPC_URL="https://..."
export PRIVATE_KEY="0x..." # keep secret

{baseDir}/scripts/pulse.sh --direct 1000000000000000000
```

## API invocation patterns

### GET agent status (read-only)

```bash
curl -sS -f "https://agent-pulse-nine.vercel.app/api/status/0xAgent" | jq
```

### POST pulse (paid; x402)

```bash
curl -sS -f -X POST "https://agent-pulse-nine.vercel.app/api/pulse" \
  -H "Content-Type: application/json" \
  -H "X-402-Payment: ${X402_PAYMENT_HEADER}" \
  -d '{"agentAddress":"0xAgent","amount":"1000000000000000000"}'
```

> Header name: this skill uses `X-402-Payment`. If the upstream service expects a different header name in your deployment, adjust `scripts/pulse.sh` accordingly.

## Direct contract invocation patterns (cast)

Read-only checks:

```bash
export BASE_SEPOLIA_RPC_URL="https://..."

# alive?
cast call --rpc-url "$BASE_SEPOLIA_RPC_URL" \
  0x2C802988c16Fae08bf04656fe93aDFA9a5bA8612 \
  "isAlive(address)(bool)" 0xAgent

# status tuple
cast call --rpc-url "$BASE_SEPOLIA_RPC_URL" \
  0x2C802988c16Fae08bf04656fe93aDFA9a5bA8612 \
  "getAgentStatus(address)(bool,uint256,uint256,uint256)" 0xAgent
```

Send pulse (requires ERC20 approval to PulseRegistry first, unless already approved):

```bash
# 1) Approve registry to transfer PULSE
cast send --rpc-url "$BASE_SEPOLIA_RPC_URL" --private-key "$PRIVATE_KEY" \
  0x7f24C286872c9594499CD634c7Cc7735551242a2 \
  "approve(address,uint256)(bool)" \
  0x2C802988c16Fae08bf04656fe93aDFA9a5bA8612 1000000000000000000

# 2) Pulse (transfers to sink and updates streak)
cast send --rpc-url "$BASE_SEPOLIA_RPC_URL" --private-key "$PRIVATE_KEY" \
  0x2C802988c16Fae08bf04656fe93aDFA9a5bA8612 \
  "pulse(uint256)" 1000000000000000000
```

## Failure handling & debugging

### Common API failures
- **401/402/403**: missing/invalid x402 payment header.
  - Ensure `X402_PAYMENT_HEADER` is set.
  - Ensure the payment is for **1 PULSE** to `0xdEaD`.
- **400**: invalid JSON or missing fields (`agentAddress`, `amount`).
- **5xx**: transient service problem → retry with backoff; check `/api/protocol-health`.

### Curl flags used in scripts
- `-sS` silent but still prints failures
- `-f` fail on non-2xx
- `--max-time` to avoid hanging

### On-chain failures (direct mode)
- Revert `BelowMinimumPulse` → amount < `minPulseAmount` (default 1e18).
- ERC20 transfer failure → missing approval or insufficient PULSE balance.
- `whenNotPaused` → registry paused.

## Security warnings

- **Never** print or commit `PRIVATE_KEY` or any signing secret.
- Treat `X402_PAYMENT_HEADER` as sensitive (may authorize payments).
- Verify contract addresses and chainId before sending transactions.
- Use small test amounts first.

## References

- Action guide: `{baseDir}/references/action_guide.md`
- PulseRegistry ABI: `{baseDir}/references/contract_abi.json`
