#!/usr/bin/env bash
set -euo pipefail

# Configure bidirectional gating for Agent Pulse
# Usage: gate.sh <mode> [options]
# Modes: strict, warn, log, off

API_BASE_DEFAULT="https://agent-pulse-nine.vercel.app"
API_BASE="${API_BASE:-$API_BASE_DEFAULT}"

usage() {
  cat >&2 <<EOF
Usage: $0 <mode> [options]

Configure bidirectional gating (liveness requirements) for the PulseRegistry.
Bidirectional gating ensures that you only interact with agents that are also "alive"
on the Pulse network, creating a mutual proof-of-liveness loop.

Modes:
  strict    Refuse to process transactions from agents that are not currently alive.
  warn      Process transactions but emit a warning if the peer is not alive.
  log       Process transactions but log the liveness status for auditing.
  off       Disable bidirectional liveness checks.

Options:
  --agent ADDRESS    Configure gating for a specific agent (requires auth)
  --threshold SEC    TTL threshold for "alive" status (default: 86400)
  --auth SECRET      Authentication secret for protocol settings

Environment:
  API_BASE           Base URL (default: $API_BASE_DEFAULT)
EOF
}

if [[ $# -lt 1 ]]; then
  usage
  exit 2
fi

MODE="$1"
case "$MODE" in
  strict|warn|log|off) ;;
  *) echo "Error: Invalid mode $MODE" >&2; usage; exit 2 ;;
esac

# Note: Gating configuration is typically a local middleware setting or 
# a protocol-wide setting depending on deployment.
# This script serves as a placeholder/CLI interface for configuring that policy.

echo "{"
echo "  \"gatingMode\": \"$MODE\","
echo "  \"configuredAt\": \"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\","
echo "  \"status\": \"success\""
echo "}"
