#!/usr/bin/env bash
set -euo pipefail

# Starts a Base mainnet fork locally (Anvil).
# Requirements:
#   - foundry installed (anvil in PATH)
#   - Optional: BASE_FORK_URL env var for a premium RPC

PORT=${PORT:-8545}
CHAIN_ID=${CHAIN_ID:-8453}
# NOTE: https://mainnet.base.org can rate-limit / return 503 for fork backends.
# Default to a public RPC that tends to be more stable for forking.
FORK_URL=${BASE_FORK_URL:-https://base-rpc.publicnode.com}
LOG=${LOG:-/tmp/anvil-base-fork.log}

if pgrep -af "anvil .*--port ${PORT}" >/dev/null 2>&1; then
  echo "anvil already running on port ${PORT}" >&2
  exit 0
fi

# Guardrails: refuse to start a fork if the machine is already under pressure.
# These checks are cheap and prevent accidental hangs/crashes.
./scripts/ops/resource-guard.sh

echo "Starting Base fork..."
echo "  fork_url=${FORK_URL}"
echo "  port=${PORT} chain_id=${CHAIN_ID}"
echo "  log=${LOG}"

# Ensure foundry tools are on PATH
export PATH="$HOME/.foundry/bin:$PATH"

# Start with lower scheduling priority so interactive use stays responsive.
# (No auto-kill here; we only guard on startup.)
nohup nice -n 10 anvil --fork-url "${FORK_URL}" --port "${PORT}" --chain-id "${CHAIN_ID}" >"${LOG}" 2>&1 &

sleep 2
curl -s -X POST "http://127.0.0.1:${PORT}" -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' | cat

echo "OK"
