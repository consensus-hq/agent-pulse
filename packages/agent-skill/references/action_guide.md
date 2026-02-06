# Agent Pulse — Action Guide

Base URL: `https://agent-pulse-nine.vercel.app`

This guide documents the main actions used by agents, observers, and (where applicable) protocol admins.

> Read-only endpoints require no authentication.

## v1 Actions

### 1) sendPulse

**Purpose:** Prove an agent is alive by sending a pulse (sending PULSE to the signal sink).

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

The service expects an HTTP header that proves payment of **1 PULSE** to the signal sink using an EVM payment header (x402).

This skill's scripts use:

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

### 2) getAgentStatus

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

### 3) getProtocolConfig

**Purpose:** Discover protocol addresses, network configuration, and x402 details.

**HTTP**

- Method: `GET`
- Path: `/api/config`

**Example**

```bash
curl -sS -f "https://agent-pulse-nine.vercel.app/api/config"
```

### 4) getProtocolHealth

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

## v2 Actions (x402 Paid)

Base URL: `https://agent-pulse-nine.vercel.app/api/v2`

All v2 endpoints require x402 payment via the `X-PAYMENT` header (or customize via `X402_HEADER_NAME`).

### 5) getReliability

**Purpose:** Get comprehensive reliability metrics for an agent.

**HTTP**

- Method: `GET`
- Path: `/api/v2/agent/:address/reliability`
- Auth: **x402 payment required ($0.01 USDC)**

**Response**

```json
{
  "address": "0x123...",
  "reliabilityScore": 85.5,
  "uptimePercent": 98.2,
  "jitter": 0.15,
  "hazardRate": 0.05,
  "lastUpdated": "2026-02-06T01:00:00Z"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `reliabilityScore` | `number` | Overall reliability (0-100) |
| `uptimePercent` | `number` | Percentage of time agent was alive |
| `jitter` | `number` | Variance in pulse interval consistency |
| `hazardRate` | `number` | Predicted failure probability (0-1) |

**Example**

```bash
export X402_PAYMENT_HEADER='...'
curl -sS -f -X GET \
  "https://agent-pulse-nine.vercel.app/api/v2/agent/0xAgent/reliability" \
  -H "X-PAYMENT: $X402_PAYMENT_HEADER"
```

**Script**

```bash
{baseDir}/scripts/get-reliability.sh 0xAgent
```

### 6) getLivenessProof

**Purpose:** Generate a cryptographically signed proof of agent liveness.

**HTTP**

- Method: `GET`
- Path: `/api/v2/agent/:address/liveness-proof`
- Auth: **x402 payment required ($0.005 USDC)**

**Response**

```json
{
  "address": "0x123...",
  "isAlive": true,
  "lastPulse": "2026-02-06T01:00:00Z",
  "staleness": 3600,
  "proofToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

| Field | Type | Description |
|-------|------|-------------|
| `isAlive` | `boolean` | Whether agent has pulsed within TTL |
| `lastPulse` | `string` | ISO timestamp of last pulse |
| `staleness` | `number` | Seconds since last pulse |
| `proofToken` | `string` | Signed JWT proof verifiable off-chain |

**Example**

```bash
export X402_PAYMENT_HEADER='...'
curl -sS -f -X GET \
  "https://agent-pulse-nine.vercel.app/api/v2/agent/0xAgent/liveness-proof" \
  -H "X-PAYMENT: $X402_PAYMENT_HEADER"
```

**Script**

```bash
{baseDir}/scripts/get-liveness-proof.sh 0xAgent
```

### 7) getGlobalStats

**Purpose:** Get network-wide aggregate statistics.

**HTTP**

- Method: `GET`
- Path: `/api/v2/network/global-stats`
- Auth: **x402 payment required ($0.03 USDC)**

**Response**

```json
{
  "totalActiveAgents": 1500,
  "averageStreak": 30.5,
  "networkSignalRate": 1000.0,
  "averageReliability": 87.2,
  "networkHealth": "healthy"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `totalActiveAgents` | `number` | Total agents currently alive |
| `averageStreak` | `number` | Average pulse streak across network |
| `networkSignalRate` | `number` | Total PULSE transferred to signal sink |
| `averageReliability` | `number` | Network-wide average reliability |
| `networkHealth` | `string` | Overall health: healthy/degraded/unhealthy |

**Example**

```bash
export X402_PAYMENT_HEADER='...'
curl -sS -f -X GET \
  "https://agent-pulse-nine.vercel.app/api/v2/network/global-stats" \
  -H "X-PAYMENT: $X402_PAYMENT_HEADER"
```

**Script**

```bash
{baseDir}/scripts/get-global-stats.sh
```

### 8) getPeerCorrelation

**Purpose:** Find agents with correlated liveness patterns.

**HTTP**

- Method: `GET`
- Path: `/api/v2/network/peer-correlation/:address`
- Auth: **x402 payment required ($0.02 USDC)**

**Response**

```json
{
  "address": "0x123...",
  "peerCorrelation": 0.78,
  "similarAgents": ["0xabc...", "0xdef..."],
  "clusterId": "copywriters-west"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `peerCorrelation` | `number` | Correlation coefficient (0-1) |
| `similarAgents` | `string[]` | Addresses with similar patterns |
| `clusterId` | `string` | Cluster identifier for grouping |

**Use Case**

Swarm coordinators use this to group agents with correlated liveness for redundant task assignment.

**Example**

```bash
export X402_PAYMENT_HEADER='...'
curl -sS -f -X GET \
  "https://agent-pulse-nine.vercel.app/api/v2/network/peer-correlation/0xAgent" \
  -H "X-PAYMENT: $X402_PAYMENT_HEADER"
```

**Script**

```bash
{baseDir}/scripts/get-peer-correlation.sh 0xAgent
```

## Utility Actions

### 9) filterAlive

**Purpose:** From a list of addresses, return only those that are alive.

**Implementation:** Direct on-chain calls via `cast`

**Options**

- `-t, --threshold SECONDS`: Time threshold (default: 86400 = 24h)
- `-r, --registry ADDRESS`: PulseRegistry address override
- `-u, --rpc-url URL`: RPC endpoint override
- `-j, --json`: Output as JSON with full details

**Example - Basic**

```bash
{baseDir}/src/filter-alive.sh 0xAgent1 0xAgent2 0xAgent3
```

**Example - With threshold**

```bash
{baseDir}/src/filter-alive.sh -t 3600 0xAgent1 0xAgent2
```

**Example - JSON output**

```bash
{baseDir}/src/filter-alive.sh -j 0xAgent1 0xAgent2
```

**Example - From stdin**

```bash
echo "0xAgent1 0xAgent2" | {baseDir}/src/filter-alive.sh
cat addresses.txt | {baseDir}/src/filter-alive.sh
```

## Admin (owner-only) on-chain actions

These actions are **not** exposed via the public API and must be called directly on-chain by the contract owner.

### updateHazard(address agent, uint8 score)

- Purpose: set an agent's hazard score (0-100)
- Access: `onlyOwner`

```bash
export BASE_SEPOLIA_RPC_URL="https://..."
export PRIVATE_KEY="0x..."  # owner key
REGISTRY=0xe61C615743A02983A46aFF66Db035297e8a43846

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

| Code | Description |
|------|-------------|
| `200` | Success |
| `400` | Bad input (invalid JSON, missing fields, invalid address/amount) |
| `402` | x402 payment required (missing/invalid payment header) |
| `403` | Forbidden (invalid/expired payment) |
| `404` | Not found (unknown route/resource or agent not registered) |
| `429` | Rate limited (free tier exceeded) |
| `500` | Server error |

### v2 Error Codes

| Code | Meaning | HTTP Status |
|------|---------|-------------|
| `INVALID_ADDRESS` | Malformed Ethereum address | 400 |
| `AGENT_NOT_FOUND` | Address never sent pulse | 404 |
| `INSUFFICIENT_PAYMENT` | Payment below price | 402 |
| `EXPIRED_PAYMENT` | Authorization expired | 403 |
| `INVALID_SIGNATURE` | Bad payment signature | 403 |
| `RATE_LIMITED` | Too many requests | 429 |

## Direct on-chain alternatives (no API)

Sometimes you need to bypass the API and read chain state directly.

```bash
export BASE_SEPOLIA_RPC_URL="https://..."
REGISTRY=0xe61C615743A02983A46aFF66Db035297e8a43846

cast call --rpc-url "$BASE_SEPOLIA_RPC_URL" "$REGISTRY" \
  "isAlive(address)(bool)" 0xAgent

cast call --rpc-url "$BASE_SEPOLIA_RPC_URL" "$REGISTRY" \
  "getAgentStatus(address)(bool,uint256,uint256,uint256)" 0xAgent
```
