# x402 API Guide (Agent Pulse)

## Overview

Agent Pulse protects `POST /api/pulse` with the x402 protocol. Agents must pay a PULSE token micropayment before a pulse is accepted.

## Environment Configuration

Set the following environment variables in your runtime:

- `NEXT_PUBLIC_PULSE_TOKEN_ADDRESS` — PULSE token contract address
- `SIGNAL_SINK_ADDRESS` or `NEXT_PUBLIC_SIGNAL_SINK_ADDRESS` — signal sink address
- `PULSE_AMOUNT` — payment amount in wei (default: `1000000000000000000`)
- `NEXT_PUBLIC_CHAIN_ID` — `84532` for Base Sepolia, `8453` for Base mainnet
- `PULSE_TOKEN_NAME` — ERC-712 domain name for the token
- `PULSE_TOKEN_VERSION` — ERC-712 domain version for the token
- `X402_FACILITATOR_URL` or `THIRDWEB_X402_FACILITATOR_URL` — thirdweb x402 facilitator
- `NEXT_PUBLIC_THIRDWEB_CLIENT_ID` (optional) — used for facilitator auth headers
- `THIRDWEB_SECRET_KEY` (optional) — used for facilitator auth headers

## Endpoint Reference

### `POST /api/pulse`

Protected endpoint for submitting pulse signals.

**Request body**

```json
{
  "agent": "<AGENT_ADDRESS>"
}
```

**Success response**

```json
{
  "success": true,
  "agent": "<AGENT_ADDRESS>",
  "paidAmount": "<WEI_AMOUNT>"
}
```

## Payment Flow (Text Diagram)

```
Agent           Server
  | POST /api/pulse (agent) |
  |------------------------>|
  | 402 + PAYMENT-REQUIRED  |
  |<------------------------|
  | sign EIP-712 payload     |
  | POST /api/pulse + PAYMENT-SIGNATURE |
  |------------------------>|
  | 200 OK (success)         |
  |<------------------------|
```

## Example cURL

**Step 1: Request payment requirements**

```bash
curl -X POST "https://<HOST>/api/pulse" \
  -H "Content-Type: application/json" \
  -d '{"agent":"<AGENT_ADDRESS>"}' -i
```

Look for the `PAYMENT-REQUIRED` header in the `402` response.

**Step 2: Submit the signed payment**

```bash
curl -X POST "https://<HOST>/api/pulse" \
  -H "Content-Type: application/json" \
  -H "PAYMENT-SIGNATURE: <BASE64_SIGNATURE>" \
  -d '{"agent":"<AGENT_ADDRESS>"}'
```

## Agent SDK Usage

```ts
import { sendPulse } from "@/lib/pulse-client";

const result = await sendPulse("<AGENT_ADDRESS>", "<PRIVATE_KEY>");
console.log(result);
```

## DeFi Proxy Endpoint

### `GET /api/defi`

Proxy to HeyElsa's x402 DeFi API. Supports price lookup and portfolio balance checks.

**Query Parameters**

- `action=price` — token price lookup (forward additional query params to HeyElsa)
- `action=portfolio` — portfolio balance lookup (forward additional query params to HeyElsa)

**Example**

```bash
curl "https://<HOST>/api/defi?action=price&symbol=PULSE"
```
