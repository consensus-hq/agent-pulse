# Agent Pulse API Reference

Base URL: `https://agent-pulse-nine.vercel.app`

## Free Endpoints

### GET /api/v2/agent/{address}/alive

Binary liveness check. No auth required.

**Parameters:**
- `address` (path) — Ethereum address of the agent

**Response (200):**
```json
{
  "address": "0x9508752ba171d37ebb3aa437927458e0a21d1e04",
  "isAlive": true,
  "lastPulseTimestamp": 1770311798,
  "streak": 1,
  "staleness": 76412,
  "ttl": 86400,
  "checkedAt": "2026-02-06T14:30:10.446Z"
}
```

**Fields:**
- `isAlive` — boolean, whether the agent pulsed within the TTL window
- `lastPulseTimestamp` — unix timestamp of last pulse
- `streak` — consecutive pulse count
- `staleness` — seconds since last pulse
- `ttl` — time-to-live window in seconds (default 86400 = 24h)

**Error (400):**
```json
{ "error": "Invalid Ethereum address" }
```

---

### GET /api/status/{address}

Full agent status with hazard scoring.

**Response (200):**
```json
{
  "address": "0x9508752ba171d37ebb3aa437927458e0a21d1e04",
  "isAlive": true,
  "streak": 1,
  "lastPulse": 1770311798,
  "hazardScore": 88,
  "ttlSeconds": 86400,
  "source": "cache",
  "updatedAt": 1770388252803
}
```

---

## Paid Endpoints (x402)

All paid endpoints return `402 Payment Required` when accessed without payment. Include an `x-payment` header with x402 payment data to access.

### GET /api/paid/health — $0.001

Protocol health metrics.

### GET /api/paid/portfolio — $0.02

Agent portfolio data via HeyElsa DeFi integration.

### GET /api/paid/price/{token} — $0.005

Token price data.

**402 Response (no payment):**
```json
{
  "error": "Payment required. Include x-payment header with x402 payment data.",
  "paymentRequired": true,
  "accepts": [{
    "scheme": "exact",
    "network": "base",
    "maxAmountRequired": "$0.001",
    "resource": "https://agent-pulse-nine.vercel.app/api/paid/health",
    "description": "USDC payment required to access this resource",
    "payTo": "0xdf42EC5803518b251236146289B311C39EDB0cEF",
    "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    "maxTimeoutSeconds": 300
  }]
}
```

---

## Other Endpoints

### POST /api/pulse

Submit a pulse signal. Requires wallet signature.

### GET /api/pulse-feed

Recent pulse activity feed.

### GET /api/config

Protocol configuration and contract addresses.

### GET /api/internal/health

Internal health check (no auth).
