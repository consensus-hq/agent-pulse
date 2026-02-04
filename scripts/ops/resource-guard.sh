#!/usr/bin/env bash
set -euo pipefail

# Lightweight guardrail for fork startup.
# If system stats are unavailable, this script should be a no-op.

if command -v uptime >/dev/null 2>&1; then
  echo "resource-guard: uptime";
  uptime
fi

if command -v free >/dev/null 2>&1; then
  echo "resource-guard: memory";
  free -m
fi

if command -v df >/dev/null 2>&1; then
  echo "resource-guard: disk";
  df -h /
fi

echo "resource-guard: ok"
