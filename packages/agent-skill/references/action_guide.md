# Agent Pulse — Action Guide

Base URL: `https://agent-pulse-nine.vercel.app`

This guide documents the main actions used by agents, observers, and (where applicable) protocol admins.

> Read-only endpoints require no authentication.

## 1) sendPulse

**Purpose:** Prove an agent is alive by sending a pulse (burning PULSE).

**HTTP**

- Method: `POST`
- Path: `/api/pulse`
- Auth: **x402 payment required**

**Body**

```json
{
  "agentAddress": "0x...",
  "amount": "1000000000000000000"
}
```

- `agentAddress`: EVM address being credited for the pulse.
- `amount`: integer string in token base units (wei, 18 decimals). Must be >= protocol min (typically `1e18`).

**x402 payment**

The service expects an HTTP header that proves payment of **1 PULSE** to `0xdEaD` (signal sink) using an EVM payment header (x402).

This skill’s scripts use:

- Header name default: `X-402-Payment`
- Header value: taken from `X402_PAYMENT_HEADER`

If your x402 middleware uses a different header name, set `X402_HEADER_NAME`.

**Example**

```bash
export X402_PAYMENT_HEADER='...'

curl -sS -f -X POST "https://agent-pulse-nine.vercel.app/api/pulse" \
  -H "Content-Type: application/json" \
  -H "X-402-Payment: $X402_PAYMENT_HEADER" \
  -d '{"agentAddress":"0xAgent","amount":"1000000000000000000"}'
```

## 2) getAgentStatus

**Purpose:** Get TTL-based liveness plus streak and hazard.

**HTTP**

- Method: `GET`
- Path: `/api/status/:address`

**Response (as described by protocol)**

- `alive`: boolean
- `streak`: number
- `lastPulse`: timestamp / or lastPulseAt (service-defined)
- `hazardScore`: 0-100
- `ttlSeconds`: number

**Example**

```bash
curl -sS -f "https://agent-pulse-nine.vercel.app/api/status/0xAgent"
```

## 3) getProtocolConfig

**Purpose:** Discover protocol addresses, network configuration, and x402 details.

**HTTP**

- Method: `GET`
- Path: `/api/config`

**Example**

```bash
curl -sS -f "https://agent-pulse-nine.vercel.app/api/config"
```

## 4) getProtocolHealth

**Purpose:** Health endpoint for monitors.

**HTTP**

- Method: `GET`
- Path: `/api/protocol-health`

**Response (as described by protocol)**

- `paused`: boolean
- `totalAgents`: number
- `health`: string/enum

**Example**

```bash
curl -sS -f "https://agent-pulse-nine.vercel.app/api/protocol-health"
```

## Admin (owner-only) on-chain actions

These actions are **not** exposed via the public API and must be called directly on-chain by the contract owner.

### updateHazard(address agent, uint8 score)

- Purpose: set an agent’s hazard score (0-100)
- Access: `onlyOwner`

```bash
export BASE_SEPOLIA_RPC_URL="https://..."
export PRIVATE_KEY="0x..."  # owner key
REGISTRY=0x2C802988c16Fae08bf04656fe93aDFA9a5bA8612

# Score must be 0-100
cast send --rpc-url "$BASE_SEPOLIA_RPC_URL" --private-key "$PRIVATE_KEY" \
  "$REGISTRY" "updateHazard(address,uint8)" 0xAgent 42
```

### pause() / unpause()

- Purpose: pause/unpause the registry (affects `pulse()` via `whenNotPaused`)
- Access: `onlyOwner`

```bash
cast send --rpc-url "$BASE_SEPOLIA_RPC_URL" --private-key "$PRIVATE_KEY" \
  "$REGISTRY" "pause()"

cast send --rpc-url "$BASE_SEPOLIA_RPC_URL" --private-key "$PRIVATE_KEY" \
  "$REGISTRY" "unpause()"
```

## API error responses

Common HTTP responses you should handle when calling the service:

- `400` — bad input (invalid JSON, missing fields, invalid address/amount)
- `402` — x402 payment required (missing/invalid payment header)
- `404` — not found (unknown route/resource)
- `429` — rate limited
- `500` — server error

## Direct on-chain alternatives (no API)

Sometimes you need to bypass the API and read chain state directly.

```bash
export BASE_SEPOLIA_RPC_URL="https://..."
REGISTRY=0x2C802988c16Fae08bf04656fe93aDFA9a5bA8612

cast call --rpc-url "$BASE_SEPOLIA_RPC_URL" "$REGISTRY" \
  "isAlive(address)(bool)" 0xAgent

cast call --rpc-url "$BASE_SEPOLIA_RPC_URL" "$REGISTRY" \
  "getAgentStatus(address)(bool,uint256,uint256,uint256)" 0xAgent
```
