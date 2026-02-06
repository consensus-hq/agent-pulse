---
name: agent-pulse
description: Send and verify on-chain liveness "pulses" for autonomous agents on Base Sepolia via the Agent Pulse API (x402 paid) or directly via the PulseRegistry contract. Includes v2 API analytics, reliability scoring, and peer correlation.
metadata: { "openclaw": { "emoji": "💓", "requires": { "bins": ["curl", "cast"] }, "allowedTools": ["exec", "read", "write", "edit", "web_fetch", "web_search"] } }
homepage: https://agent-pulse-nine.vercel.app
---

# Agent Pulse (💓)

Agent Pulse is a liveness signaling protocol: an agent periodically sends a **pulse** by transferring **PULSE** tokens to a signal sink. Observers can read status (alive/streak/lastPulse/hazard/TTL), reliability metrics, and network analytics via the v1 or v2 APIs.

**Network:** Base Sepolia (chainId **84532**)

- PulseToken: `0x7f24C286872c9594499CD634c7Cc7735551242a2`
- PulseRegistry: `0x2C802988c16Fae08bf04656fe93aDFA9a5bA8612`
- API: `https://agent-pulse-nine.vercel.app`

> Important: $PULSE is a **utility token for pulse signals**. Avoid language suggesting financial upside.

## When to use this skill

Use this skill when you need to:

- **Send a pulse** (paid): prove an agent is alive by sending PULSE to the signal sink.
- **Check a specific agent's liveness**: verify whether they're currently alive (TTL-based) and see streak and last pulse.
- **Check protocol configuration**: confirm addresses, network, and x402 requirements.
- **Check protocol health**: see whether the protocol is paused and overall health.
- **Get reliability metrics** (v2, paid): fetch reliability score, uptime, jitter, and hazard rate.
- **Get liveness proof** (v2, paid): obtain a cryptographically signed proof of liveness.
- **Get global stats** (v2, paid): view network-wide aggregate statistics.
- **Get peer correlation** (v2, paid): find agents with correlated liveness patterns.
- **Filter alive agents**: from a list of addresses, return only those that are alive.

## Decision tree (pick the right action)

1) Do you need to **send a pulse**?
- Yes → `scripts/pulse.sh`
  - Prefer **API mode** if the environment has an **x402 payment header** available.
  - Use **direct on-chain mode** if you have RPC + key and want to bypass HTTP.

2) Do you just need read-only information (v1)?
- Agent-specific status → `scripts/status.sh <agentAddress>`
- Protocol config → `scripts/config.sh`
- Protocol health → `scripts/health.sh`

3) Do you need v2 analytics (requires x402 payment)?
- Reliability metrics → `scripts/get-reliability.sh <agentAddress>`
- Liveness proof → `scripts/get-liveness-proof.sh <agentAddress>`
- Global network stats → `scripts/get-global-stats.sh`
- Peer correlation → `scripts/get-peer-correlation.sh <agentAddress>`

4) Do you need to filter a list of addresses?
- Filter alive agents → `src/filter-alive.sh <address1> [address2] ...`

5) Are API calls failing but you still need authoritative state?
- Use `cast call` against PulseRegistry for `isAlive()` / `getAgentStatus()`.

## Quickstart

### Read-only (no auth)

```bash
{baseDir}/scripts/config.sh
{baseDir}/scripts/health.sh
{baseDir}/scripts/status.sh 0xYourAgentAddress
```

### Send a pulse (API / x402)

This endpoint is **x402 gated**. Authenticate with an EVM payment header that sends **1 PULSE** to the signal sink.

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

### v2 Analytics (requires x402 payment)

```bash
export X402_PAYMENT_HEADER='...'

# Get reliability metrics
{baseDir}/scripts/get-reliability.sh 0xYourAgentAddress

# Get signed liveness proof
{baseDir}/scripts/get-liveness-proof.sh 0xYourAgentAddress

# Get global network statistics
{baseDir}/scripts/get-global-stats.sh

# Get peer correlation analysis
{baseDir}/scripts/get-peer-correlation.sh 0xYourAgentAddress
```

### Filter alive agents

```bash
# Direct arguments
{baseDir}/src/filter-alive.sh 0xAgent1 0xAgent2 0xAgent3

# From stdin
echo "0xAgent1 0xAgent2" | {baseDir}/src/filter-alive.sh

# With custom threshold (1 hour)
{baseDir}/src/filter-alive.sh -t 3600 0xAgent1 0xAgent2

# JSON output with details
{baseDir}/src/filter-alive.sh -j 0xAgent1 0xAgent2
```

## API invocation patterns

### v1 Endpoints

#### GET agent status (read-only)

```bash
curl -sS -f "https://agent-pulse-nine.vercel.app/api/status/0xAgent" | jq
```

#### POST pulse (paid; x402)

```bash
curl -sS -f -X POST "https://agent-pulse-nine.vercel.app/api/pulse" \
  -H "Content-Type: application/json" \
  -H "X-402-Payment: ${X402_PAYMENT_HEADER}" \
  -d '{"agentAddress":"0xAgent","amount":"1000000000000000000"}'
```

> Header name: v1 scripts use `X-402-Payment`. v2 scripts use `X-PAYMENT` by default. Adjust via `X402_HEADER_NAME` env var.

### v2 Endpoints (all require x402 payment)

Base URL: `https://agent-pulse-nine.vercel.app/api/v2`

#### GET agent reliability

```bash
curl -sS -f -X GET \
  "https://agent-pulse-nine.vercel.app/api/v2/agent/0xAgent/reliability" \
  -H "X-PAYMENT: ${X402_PAYMENT_HEADER}"
```

Response:
```json
{
  "address": "0x...",
  "reliabilityScore": 92.3,
  "uptimePercent": 99.1,
  "jitter": 0.08,
  "hazardRate": 0.02,
  "lastUpdated": "2026-02-06T01:45:00Z"
}
```

#### GET liveness proof

```bash
curl -sS -f -X GET \
  "https://agent-pulse-nine.vercel.app/api/v2/agent/0xAgent/liveness-proof" \
  -H "X-PAYMENT: ${X402_PAYMENT_HEADER}"
```

Response:
```json
{
  "address": "0x...",
  "isAlive": true,
  "lastPulse": "2026-02-06T01:00:00Z",
  "staleness": 3600,
  "proofToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

#### GET global stats

```bash
curl -sS -f -X GET \
  "https://agent-pulse-nine.vercel.app/api/v2/network/global-stats" \
  -H "X-PAYMENT: ${X402_PAYMENT_HEADER}"
```

Response:
```json
{
  "totalActiveAgents": 1500,
  "averageStreak": 30.5,
  "networkSignalRate": 1000.0,
  "averageReliability": 87.2,
  "networkHealth": "healthy"
}
```

#### GET peer correlation

```bash
curl -sS -f -X GET \
  "https://agent-pulse-nine.vercel.app/api/v2/network/peer-correlation/0xAgent" \
  -H "X-PAYMENT: ${X402_PAYMENT_HEADER}"
```

Response:
```json
{
  "address": "0x...",
  "peerCorrelation": 0.78,
  "similarAgents": ["0xabc...", "0xdef..."],
  "clusterId": "copywriters-west"
}
```

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

# 2) Pulse (transfers to signal sink and updates streak)
cast send --rpc-url "$BASE_SEPOLIA_RPC_URL" --private-key "$PRIVATE_KEY" \
  0x2C802988c16Fae08bf04656fe93aDFA9a5bA8612 \
  "pulse(uint256)" 1000000000000000000
```

## Failure handling & debugging

### Common API failures
- **401/402/403**: missing/invalid x402 payment header.
  - Ensure `X402_PAYMENT_HEADER` is set.
  - Ensure the payment is for the correct amount (see endpoint pricing).
- **400**: invalid JSON or missing fields (`agentAddress`, `amount`).
- **404**: agent not found (address never sent a pulse).
- **429**: rate limited (free tier exceeded).
- **5xx**: transient service problem → retry with backoff; check `/api/protocol-health`.

### Curl flags used in scripts
- `-sS` silent but still prints failures
- `-f` fail on non-2xx
- `--max-time` to avoid hanging

### On-chain failures (direct mode)
- Revert `BelowMinimumPulse` → amount < `minPulseAmount` (default 1e18).
- ERC20 transfer failure → missing approval or insufficient PULSE balance.
- `whenNotPaused` → registry paused.

## v2 API Pricing

| Endpoint | Price (USDC) |
|----------|--------------|
| `/agent/{address}/reliability` | $0.01 |
| `/agent/{address}/liveness-proof` | $0.005 |
| `/network/global-stats` | $0.03 |
| `/network/peer-correlation/{address}` | $0.02 |

## Security warnings

- **Never** print or commit `PRIVATE_KEY` or any signing secret.
- Treat `X402_PAYMENT_HEADER` as sensitive (may authorize payments).
- Verify contract addresses and chainId before sending transactions.
- Use small test amounts first.

## References

- Action guide: `{baseDir}/references/action_guide.md`
- PulseRegistry ABI: `{baseDir}/references/contract_abi.json`
