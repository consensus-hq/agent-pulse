#!/usr/bin/env bash
set -euo pipefail

API_BASE_DEFAULT="https://agent-pulse-nine.vercel.app"
API_BASE="${API_BASE:-$API_BASE_DEFAULT}"

curl -sS -f \
  --connect-timeout "${CONNECT_TIMEOUT:-10}" \
  --max-time "${MAX_TIME:-30}" \
  "$API_BASE/api/config"
