# Agent Pulse API v2 Reference

> **Base URL:** `https://agent-pulse-nine.vercel.app/api/v2`

---

## Table of Contents

- [Authentication (x402)](#authentication-x402)
- [Rate Limits](#rate-limits)
- [Freshness Pricing](#freshness-pricing)
- [Free Endpoint](#free-endpoint)
- [Paid Endpoints (8)](#paid-endpoints)
- [Bundled Queries (3)](#bundled-queries)
- [Error Responses](#error-responses)

---

## Authentication (x402)

All paid endpoints use the **x402 Payment Protocol**:

1. Send request without payment → receive `402 Payment Required`
2. Response includes `X-PAYMENT-REQUIRED` header with price, token (USDC), and chain (Base)
3. Sign EIP-3009 USDC authorization
4. Retry with `X-PAYMENT` header containing signed authorization
5. Receive data with `X-PAYMENT-CONFIRMED` receipt

### Request Headers

```http
X-PAYMENT: <signed EIP-3009 authorization>
X-FRESHNESS: real-time | cached    # Optional, controls pricing
```

### Response Headers

```http
X-PAYMENT-CONFIRMED: <receipt>
X-PAYMENT-REQUIRED: {"amount": "0.01", "token": "USDC", "chainId": 8453}
X-Cache-Status: HIT | MISS
X-Data-Age: 45                     # Seconds since computation
X-Price-Paid: 0.015                # Actual amount charged
```

### SDK (Recommended)

```typescript
import { PulseClient } from '@agent-pulse/sdk';

const client = new PulseClient({ walletClient });
// Payment handled automatically for all paid calls
const data = await client.getReliability('0x123...');
```

---

## Rate Limits

| Tier | Limit | Scope | Endpoints |
|------|-------|-------|-----------|
| **Free** | 60/min, 1000/day | Per IP | `/alive` only |
| **Paid** | Unlimited | Per x402 payment | All paid endpoints |

Headers on every response:

```http
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 1707168000
```

---

## Freshness Pricing

| Freshness | Multiplier | Description |
|-----------|------------|-------------|
| Real-time (cache miss) | **1.5x** base | Fresh computation triggered |
| Cached (≤1h) | **0.5x** base | Served from cache |

Request specific freshness via header:

```http
X-Freshness: real-time    # Force fresh computation (1.5x)
X-Freshness: cached       # Accept cached data (0.5x)
```

---

## Free Endpoint

### `GET /v2/agent/{addr}/alive`

Check if an agent is alive. **No payment required.**

**Rate limit:** 60/min per IP, 1000/day

#### Request

```bash
curl https://agent-pulse-nine.vercel.app/api/v2/agent/0x9508752B.../alive
```

#### Response `200 OK`

```json
{
  "alive": true,
  "lastPulse": "2026-02-06T01:00:00Z"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `alive` | `boolean` | Whether agent pulsed within TTL (24h) |
| `lastPulse` | `string` | ISO 8601 timestamp of last burn |

---

## Paid Endpoints

### 1. `GET /v2/agent/{addr}/reliability`

Comprehensive reliability metrics.

**Base price:** $0.01 · **Cache TTL:** 5min · **Network effect:** Linear

```bash
curl -H "X-PAYMENT: ${AUTH}" \
  https://agent-pulse-nine.vercel.app/api/v2/agent/0x123.../reliability
```

```json
{
  "address": "0x123...",
  "reliabilityScore": 92.3,
  "uptimePercent": 99.1,
  "jitter": 0.08,
  "hazardRate": 0.02,
  "lastUpdated": "2026-02-06T01:45:00Z"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `reliabilityScore` | `number` | Overall reliability (0-100) |
| `uptimePercent` | `number` | % of time agent was alive |
| `jitter` | `number` | Variance in pulse interval consistency |
| `hazardRate` | `number` | Predicted failure probability (0-1) |

---

### 2. `GET /v2/agent/{addr}/liveness-proof`

Cryptographically signed proof of agent liveness.

**Base price:** $0.005 · **Cache TTL:** 30s · **Network effect:** None

```json
{
  "address": "0x123...",
  "isAlive": true,
  "lastPulse": "2026-02-06T01:00:00Z",
  "staleness": 3600,
  "proofToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

| Field | Type | Description |
|-------|------|-------------|
| `proofToken` | `string` | Signed JWT, verifiable off-chain |
| `staleness` | `number` | Seconds since last pulse |

---

### 3. `GET /v2/agent/{addr}/burn-history`

Historical burn data and analytics.

**Base price:** $0.015 · **Cache TTL:** 15min · **Network effect:** Linear

#### Request Body (optional filters)

```json
{
  "startDate": "2026-01-01T00:00:00Z",
  "endDate": "2026-02-06T00:00:00Z",
  "limit": 100
}
```

```json
{
  "address": "0x123...",
  "totalBurned": 150.0,
  "burnRate": 0.5,
  "history": [
    {
      "timestamp": "2026-02-01T00:00:00Z",
      "amount": 1.0,
      "streak": 5,
      "txHash": "0xabc..."
    }
  ]
}
```

---

### 4. `GET /v2/agent/{addr}/streak-analysis`

Streak patterns and consistency metrics.

**Base price:** $0.008 · **Cache TTL:** 5min · **Network effect:** None

```json
{
  "address": "0x123...",
  "currentStreak": 45,
  "maxStreak": 60,
  "streakConsistency": 92.3,
  "averageInterval": 85200,
  "longestGap": 172800
}
```

---

### 5. `GET /v2/network/peer-correlation/{addr}`

Find agents with correlated liveness patterns.

**Base price:** $0.02 · **Cache TTL:** 60min · **Network effect:** Superlinear

```json
{
  "address": "0x123...",
  "peerCorrelation": 0.78,
  "similarAgents": ["0xabc...", "0xdef..."],
  "clusterId": "copywriters-west",
  "clusterSize": 12
}
```

**Use case:** Swarm coordinators group correlated agents for redundant task assignment.

---

### 6. `GET /v2/agent/{addr}/uptime-metrics`

Detailed uptime and downtime analysis.

**Base price:** $0.01 · **Cache TTL:** 5min · **Network effect:** Linear

```json
{
  "address": "0x123...",
  "uptimePercent": 99.1,
  "downtimeEvents": 2,
  "averageDowntime": 1800,
  "mttr": 900,
  "mtbf": 43200
}
```

| Field | Type | Description |
|-------|------|-------------|
| `mttr` | `number` | Mean time to recovery (seconds) |
| `mtbf` | `number` | Mean time between failures (seconds) |

---

### 7. `POST /v2/agent/{addr}/predictive-insights`

ML-powered predictions about agent behavior.

**Base price:** $0.025 · **Cache TTL:** 60min · **Network effect:** Superlinear

```json
{
  "address": "0x123...",
  "predictedNextPulse": "2026-02-07T01:00:00Z",
  "failureRisk": "low",
  "confidence": 0.87,
  "factors": ["consistent_timing", "low_jitter", "high_streak"]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `failureRisk` | `string` | `low` / `medium` / `high` |
| `confidence` | `number` | Prediction confidence (0-1) |

---

### 8. `GET /v2/network/global-stats`

Network-wide aggregate statistics.

**Base price:** $0.03 · **Cache TTL:** 60min · **Network effect:** Superlinear

```json
{
  "totalActiveAgents": 1500,
  "averageStreak": 30.5,
  "networkBurnRate": 1000.0,
  "averageReliability": 87.2,
  "networkHealth": "healthy",
  "totalBurned": 450000,
  "timestamp": "2026-02-06T02:00:00Z"
}
```

---

## Bundled Queries

~20% discount over individual endpoints.

### Router Bundle — `GET /v2/bundled/agent/{addr}/reliability-portfolio`

**Price:** $0.02 (vs $0.025 individual)

Combines: reliability + liveness-proof + uptime-metrics

```json
{
  "address": "0x123...",
  "reliability": { "reliabilityScore": 92.3, "uptimePercent": 99.1, "jitter": 0.08, "hazardRate": 0.02 },
  "livenessProof": { "isAlive": true, "lastPulse": "2026-02-06T01:00:00Z", "proofToken": "eyJ..." },
  "uptime": { "uptimePercent": 99.1, "mttr": 900, "mtbf": 43200 }
}
```

### Fleet Bundle — `POST /v2/bundled/fleet/uptime-health`

**Price:** $0.15 (batch up to 10 agents)

```json
// Request
{ "agents": ["0x1...", "0x2...", "0x3..."] }

// Response
{
  "agents": [
    { "address": "0x1...", "reliabilityScore": 92.3, "uptimePercent": 99.1, "alive": true },
    { "address": "0x2...", "reliabilityScore": 85.0, "uptimePercent": 97.5, "alive": true },
    { "address": "0x3...", "reliabilityScore": 0, "uptimePercent": 0, "alive": false }
  ],
  "fleetHealth": 91.1,
  "aliveCount": 2,
  "totalCount": 3
}
```

### Risk Bundle — `GET /v2/bundled/agent/{addr}/peer-graph`

**Price:** $0.04 (vs $0.053 individual)

Combines: peer-correlation + predictive-insights + streak-analysis

```json
{
  "address": "0x123...",
  "peerCorrelation": { "similarAgents": ["0xabc..."], "clusterId": "copywriters-west" },
  "predictive": { "failureRisk": "low", "confidence": 0.87 },
  "streak": { "currentStreak": 45, "maxStreak": 60, "streakConsistency": 92.3 }
}
```

---

## Pricing Summary

| Endpoint | Base | Real-Time (1.5x) | Cached (0.5x) |
|----------|------|-------------------|----------------|
| `/alive` | **FREE** | — | — |
| `/reliability` | $0.01 | $0.015 | $0.005 |
| `/liveness-proof` | $0.005 | $0.0075 | $0.0025 |
| `/burn-history` | $0.015 | $0.0225 | $0.0075 |
| `/streak-analysis` | $0.008 | $0.012 | $0.004 |
| `/peer-correlation` | $0.02 | $0.03 | $0.01 |
| `/uptime-metrics` | $0.01 | $0.015 | $0.005 |
| `/predictive-insights` | $0.025 | $0.0375 | $0.0125 |
| `/global-stats` | $0.03 | $0.045 | $0.015 |
| **Router Bundle** | $0.02 | $0.03 | $0.01 |
| **Fleet Bundle** | $0.15 | $0.225 | $0.075 |
| **Risk Bundle** | $0.04 | $0.06 | $0.02 |

---

## Error Responses

### HTTP Status Codes

| Code | Description |
|------|-------------|
| `200` | Success |
| `400` | Bad Request — invalid parameters |
| `402` | Payment Required — include X-PAYMENT header |
| `403` | Forbidden — invalid/expired payment |
| `404` | Not Found — agent never pulsed |
| `429` | Rate Limited — check Retry-After header |
| `500` | Server Error — retry with backoff |
| `503` | Service Unavailable |

### Error Schema

```json
{
  "error": {
    "code": "INSUFFICIENT_PAYMENT",
    "message": "Payment amount 0.005 USDC below required 0.01 USDC",
    "details": {
      "required": "0.01",
      "provided": "0.005",
      "currency": "USDC"
    },
    "retryable": true,
    "requestId": "req_abc123"
  }
}
```

### Error Codes

| Code | Meaning | HTTP |
|------|---------|------|
| `INVALID_ADDRESS` | Malformed Ethereum address | 400 |
| `AGENT_NOT_FOUND` | Address never pulsed | 404 |
| `INSUFFICIENT_PAYMENT` | Payment below required price | 402 |
| `EXPIRED_PAYMENT` | Authorization expired | 403 |
| `INVALID_SIGNATURE` | Bad payment signature | 403 |
| `RATE_LIMITED` | Too many requests | 429 |
| `FRESHNESS_UNAVAILABLE` | Real-time data unavailable | 503 |
| `BATCH_TOO_LARGE` | Fleet bundle >10 agents | 400 |

---

**Contract addresses:** See [LINKS.md](../LINKS.md)  
**SDK:** See [SDK_QUICKSTART.md](./SDK_QUICKSTART.md)
