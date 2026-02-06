#!/usr/bin/env bash
set -euo pipefail

# Get global network statistics from Agent Pulse API v2
# Usage: get-global-stats.sh
# Env: API_BASE, X402_PAYMENT_HEADER, X402_HEADER_NAME

API_BASE_DEFAULT="https://agent-pulse-nine.vercel.app"
API_BASE="${API_BASE:-$API_BASE_DEFAULT}"

usage() {
  cat >&2 <<EOF
Usage: $0

Get global network statistics from Agent Pulse API v2.

Environment:
  API_BASE                Base URL (default: $API_BASE_DEFAULT)
  X402_PAYMENT_HEADER     x402 payment header value (required)
  X402_HEADER_NAME        HTTP header name (default: X-PAYMENT)

Price: $0.03 USDC

Returns:
  - totalActiveAgents: Number of active agents
  - averageStreak: Average pulse streak across network
  - networkSignalRate: Total PULSE transferred to signal sink
  - averageReliability: Network-wide average reliability score
  - networkHealth: Overall network health status
EOF
}

if [[ $# -ne 0 ]]; then
  usage
  exit 2
fi

HEADER_NAME="${X402_HEADER_NAME:-X-PAYMENT}"
if [[ ! "$HEADER_NAME" =~ ^[a-zA-Z0-9_-]+$ ]]; then
  echo "Error: Invalid header name format." >&2
  exit 1
fi

: "${X402_PAYMENT_HEADER:?X402_PAYMENT_HEADER is required for v2 API calls}"

curl -sS -f -X GET \
  --connect-timeout "${CONNECT_TIMEOUT:-10}" \
  --max-time "${MAX_TIME:-30}" \
  "$API_BASE/api/v2/network/global-stats" \
  -H "Accept: application/json" \
  -H "$HEADER_NAME: $X402_PAYMENT_HEADER"
