#!/usr/bin/env bash
set -euo pipefail

# Get peer correlation analysis from Agent Pulse API v2
# Usage: get-peer-correlation.sh <agentAddress>
# Env: API_BASE, X402_PAYMENT_HEADER, X402_HEADER_NAME

API_BASE_DEFAULT="https://agent-pulse-nine.vercel.app"
API_BASE="${API_BASE:-$API_BASE_DEFAULT}"

usage() {
  cat >&2 <<EOF
Usage: $0 <agentAddress>

Get peer correlation analysis from Agent Pulse API v2.
Finds agents with correlated liveness patterns for swarm coordination.

Arguments:
  agentAddress    Ethereum address of the agent (0x...)

Environment:
  API_BASE                Base URL (default: $API_BASE_DEFAULT)
  X402_PAYMENT_HEADER     x402 payment header value (required)
  X402_HEADER_NAME        HTTP header name (default: X-PAYMENT)

Price: $0.02 USDC

Returns:
  - peerCorrelation: Correlation coefficient (0-1)
  - similarAgents: List of addresses with similar patterns
  - clusterId: Cluster identifier for grouping
EOF
}

if [[ $# -ne 1 ]]; then
  usage
  exit 2
fi

AGENT_ADDRESS="$1"
if [[ ! "$AGENT_ADDRESS" =~ ^0x[a-fA-F0-9]{40}$ ]]; then
  echo "Error: Invalid agent address format. Expected 0x followed by 40 hex characters." >&2
  exit 1
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
  "$API_BASE/api/v2/network/peer-correlation/$AGENT_ADDRESS" \
  -H "Accept: application/json" \
  -H "$HEADER_NAME: $X402_PAYMENT_HEADER"
