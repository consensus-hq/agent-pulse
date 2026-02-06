#!/usr/bin/env bash
set -euo pipefail

API_BASE_DEFAULT="https://agent-pulse-nine.vercel.app"
API_BASE="${API_BASE:-$API_BASE_DEFAULT}"

REGISTRY_DEFAULT="0x2C802988c16Fae08bf04656fe93aDFA9a5bA8612"
TOKEN_DEFAULT="0x7f24C286872c9594499CD634c7Cc7735551242a2"

REGISTRY_ADDRESS="${PULSE_REGISTRY_ADDRESS:-$REGISTRY_DEFAULT}"
PULSE_TOKEN_ADDRESS="${PULSE_TOKEN_ADDRESS:-$TOKEN_DEFAULT}"

usage() {
  cat >&2 <<EOF
Usage:
  API (x402):
    $0 <agentAddress> <amountWei>

  Direct on-chain (cast):
    $0 --direct <amountWei>

Env:
  API_BASE                Base URL (default: $API_BASE_DEFAULT)
  X402_PAYMENT_HEADER     x402 payment header value (required for API mode)
  X402_HEADER_NAME        HTTP header name (default: X-402-Payment)

  BASE_SEPOLIA_RPC_URL    RPC URL (required for --direct)
  PRIVATE_KEY             Private key (required for --direct)
  PULSE_REGISTRY_ADDRESS  Override registry (default: $REGISTRY_DEFAULT)
  PULSE_TOKEN_ADDRESS     Override token (default: $TOKEN_DEFAULT)
EOF
}

if [[ $# -lt 1 ]]; then
  usage
  exit 2
fi

if [[ "$1" == "--direct" ]]; then
  if [[ $# -ne 2 ]]; then
    usage
    exit 2
  fi

  AMOUNT="$2"
  : "${BASE_SEPOLIA_RPC_URL:?BASE_SEPOLIA_RPC_URL is required for --direct}"
  : "${PRIVATE_KEY:?PRIVATE_KEY is required for --direct}"

  echo "[agent-pulse] Direct mode: approving registry then pulsing..." >&2

  # Approve registry to transfer PULSE.
  cast send --rpc-url "$BASE_SEPOLIA_RPC_URL" --private-key "$PRIVATE_KEY" \
    "$PULSE_TOKEN_ADDRESS" \
    "approve(address,uint256)(bool)" \
    "$REGISTRY_ADDRESS" "$AMOUNT" >&2

  # Call pulse(amount) on registry.
  cast send --rpc-url "$BASE_SEPOLIA_RPC_URL" --private-key "$PRIVATE_KEY" \
    "$REGISTRY_ADDRESS" \
    "pulse(uint256)" "$AMOUNT"

  exit 0
fi

# API mode
if [[ $# -ne 2 ]]; then
  usage
  exit 2
fi

AGENT_ADDRESS="$1"
AMOUNT="$2"

HEADER_NAME="${X402_HEADER_NAME:-X-402-Payment}"
: "${X402_PAYMENT_HEADER:?X402_PAYMENT_HEADER is required for API mode}"

curl -sS -f -X POST \
  --connect-timeout "${CONNECT_TIMEOUT:-10}" \
  --max-time "${MAX_TIME:-60}" \
  "$API_BASE/api/pulse" \
  -H "Content-Type: application/json" \
  -H "$HEADER_NAME: $X402_PAYMENT_HEADER" \
  -d "{\"agentAddress\":\"$AGENT_ADDRESS\",\"amount\":\"$AMOUNT\"}"
