# Agent Pulse — API Reference (Judge-Friendly)

**Production demo:** https://agent-pulse-nine.vercel.app

## Base URLs

- **Primary (v2):** `https://agent-pulse-nine.vercel.app/api/v2`
- **Other public endpoints:** `https://agent-pulse-nine.vercel.app/api/*`

## Status of endpoints

- **LIVE (hackathon build):** the **free liveness** endpoint (`/api/v2/agent/:address/alive`) plus a few supporting endpoints (`/api/status`, `/api/badge`, `/api/internal/health`).
- **DESIGNED / SPEC (not currently enabled at `/api/v2/*`):** x402-gated “liveness intelligence” endpoints (reliability, peer correlation, etc.). The v2 spec is documented, and route implementations are currently parked under `apps/web/src/app/api/v2/_disabled/*`.

---

## 1) Free v2 Liveness (LIVE)

### `GET /api/v2/agent/{address}/alive`

**Purpose:** frictionless GTM wedge. Routers can check liveness with no wallet prompts and no payments.

**Example**

```bash
curl \
  https://agent-pulse-nine.vercel.app/api/v2/agent/0x7f24C286872c9594499CD634c7Cc7735551242a2/alive \
  | jq
```

**Response: `200 OK`**

```json
{
  "address": "0x7f24c286872c9594499cd634c7cc7735551242a2",
  "isAlive": true,
  "lastPulseTimestamp": 1738832400,
  "streak": 12,
  "staleness": 3600,
  "ttl": 86400,
  "checkedAt": "2026-02-06T14:31:22.123Z"
}
```

**Fields**

- `address` *(string)*: normalized lowercase address
- `isAlive` *(boolean)*: deterministic on-chain liveness boolean
- `lastPulseTimestamp` *(number)*: unix seconds
- `streak` *(number)*: current streak (from the registry)
- `staleness` *(number | "Infinity")*: seconds since last pulse (computed at request time)
- `ttl` *(number)*: TTL in seconds (default 86400)
- `checkedAt` *(string)*: ISO timestamp

**Failure modes**

- `400` if the address is invalid.
- If the registry read fails (e.g., never registered), the API responds with a safe “not alive” object:

```json
{
  "address": "0x...",
  "isAlive": false,
  "lastPulseTimestamp": 0,
  "streak": 0,
  "staleness": "Infinity",
  "ttl": 86400,
  "checkedAt": "2026-02-06T14:31:22.123Z",
  "note": "Agent not found in registry"
}
```

---

## 2) Status (LIVE)

### `GET /api/status/{address}`

**Purpose:** UI-friendly liveness status with a simple **hazard score** and KV caching.

**Example**

```bash
curl https://agent-pulse-nine.vercel.app/api/status/0x7f24C286872c9594499CD634c7Cc7735551242a2 \
  | jq
```

**Response: `200 OK`**

```json
{
  "address": "0x...",
  "isAlive": true,
  "streak": 12,
  "lastPulse": 1738832400,
  "hazardScore": 4,
  "ttlSeconds": 86400,
  "source": "cache",
  "updatedAt": 1738850000000
}
```

**Failure modes**

- `400` invalid address format
- `429` request quota exceeded
- `503` chain unavailable

---

## 3) Badge (LIVE)

### `GET /api/badge/{address}`

**Purpose:** a Shields-style SVG badge (good for READMEs / dashboards).

**Example**

```bash
curl -L https://agent-pulse-nine.vercel.app/api/badge/0x7f24C286872c9594499CD634c7Cc7735551242a2
```

**Response:** `200 OK` with `Content-Type: image/svg+xml`

---

## 4) Health (LIVE)

### `GET /api/internal/health`

**Purpose:** basic health check for deploy verification.

```bash
curl https://agent-pulse-nine.vercel.app/api/internal/health | jq
```

---

## 5) v2 Liveness Intelligence (DESIGNED / SPEC)

> These endpoints are part of the v4 design and are documented for hackathon judges, but are **not currently enabled** at the canonical `/api/v2/*` paths in this build.

**Spec source:** [`docs/API_V2.md`](./API_V2.md)

### Endpoints (x402-gated; USDC micropayments)

- `GET /api/v2/agent/{addr}/reliability`
- `GET /api/v2/agent/{addr}/liveness-proof`
- `GET /api/v2/agent/{addr}/burn-history`
- `GET /api/v2/agent/{addr}/streak-analysis`
- `GET /api/v2/agent/{addr}/uptime-metrics`
- `POST /api/v2/agent/{addr}/predictive-insights`
- `GET /api/v2/network/peer-correlation/{addr}`
- `GET /api/v2/network/global-stats`

### Bundles (x402-gated)

- `GET /api/v2/bundled/agent/{addr}/reliability-portfolio`
- `POST /api/v2/bundled/fleet/uptime-health`
- `GET /api/v2/bundled/network/peer-graph/{addr}`

### x402 authentication flow (high-level)

1. Request without payment → **402 Payment Required**
2. Parse payment requirements (amount, asset, chain)
3. Create + sign authorization
4. Retry with payment header

More detail: [`docs/X402_API_GUIDE.md`](./X402_API_GUIDE.md)

---

## Changelog note

Some older docs use an abbreviated `/alive` response (`{ alive, lastPulse }`). The canonical live response shape is the one shown in **Section 1** (see implementation in `apps/web/src/app/api/v2/agent/[address]/alive/route.ts`).
