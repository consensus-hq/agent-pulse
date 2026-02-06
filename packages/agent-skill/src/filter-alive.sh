#!/usr/bin/env bash
set -euo pipefail

# Filter Alive - CLI wrapper for pulse-filter logic
# Takes a list of addresses and returns only alive ones
# 
# Usage: filter-alive.sh [options] <address1> [address2] [address3] ...
#        echo "address1 address2" | filter-alive.sh [options]
#        cat addresses.txt | filter-alive.sh [options]
#
# Options:
#   -t, --threshold SECONDS    Time threshold in seconds (default: 86400 = 24h)
#   -r, --registry ADDRESS     PulseRegistry contract address
#   -u, --rpc-url URL          RPC URL for blockchain
#   -j, --json                 Output as JSON (default: newline-separated)
#   -h, --help                 Show this help

API_BASE_DEFAULT="https://agent-pulse-nine.vercel.app"
API_BASE="${API_BASE:-$API_BASE_DEFAULT}"

# Default values
THRESHOLD="${PULSE_FILTER_THRESHOLD:-86400}"  # 24 hours
REGISTRY_DEFAULT="0x2C802988c16Fae08bf04656fe93aDFA9a5bA8612"
REGISTRY_ADDRESS="${PULSE_REGISTRY_ADDRESS:-$REGISTRY_DEFAULT}"
RPC_URL="${BASE_SEPOLIA_RPC_URL:-https://sepolia.base.org}"
OUTPUT_JSON=false

usage() {
  cat >&2 <<EOF
Filter Alive - Returns only alive agents from a list of addresses

Usage:
  $0 [options] <address1> [address2] ...
  echo "addr1 addr2" | $0 [options]
  cat addresses.txt | $0 [options]

Options:
  -t, --threshold SECONDS    Time threshold in seconds (default: 86400 = 24h)
  -r, --registry ADDRESS     PulseRegistry address (default: $REGISTRY_DEFAULT)
  -u, --rpc-url URL          RPC endpoint (default: https://sepolia.base.org)
  -j, --json                 Output as JSON with details
  -h, --help                 Show this help

Environment:
  PULSE_FILTER_THRESHOLD     Default threshold in seconds
  PULSE_REGISTRY_ADDRESS     Default registry address
  BASE_SEPOLIA_RPC_URL       Default RPC URL

Examples:
  $0 0x123... 0x456... 0x789...
  $0 -t 3600 0x123... 0x456...  # 1 hour threshold
  echo "0x123... 0x456..." | $0 -j
  cast call --rpc-url \$RPC_URL \$REGISTRY "getAgentStatus(address)(bool,uint256,uint256,uint256)" \$AGENT 2>/dev/null && echo "\$AGENT"
EOF
}

# Parse arguments
ADDRESSES=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    -t|--threshold)
      THRESHOLD="$2"
      shift 2
      ;;
    -r|--registry)
      REGISTRY_ADDRESS="$2"
      shift 2
      ;;
    -u|--rpc-url)
      RPC_URL="$2"
      shift 2
      ;;
    -j|--json)
      OUTPUT_JSON=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    -*)
      echo "Error: Unknown option $1" >&2
      usage
      exit 2
      ;;
    *)
      ADDRESSES+=("$1")
      shift
      ;;
  esac
done

# Validate threshold
if [[ ! "$THRESHOLD" =~ ^[0-9]+$ ]]; then
  echo "Error: Threshold must be a positive integer (seconds)." >&2
  exit 1
fi

# Validate registry address
if [[ ! "$REGISTRY_ADDRESS" =~ ^0x[a-fA-F0-9]{40}$ ]]; then
  echo "Error: Invalid registry address format." >&2
  exit 1
fi

# Collect addresses from stdin if no arguments provided
if [[ ${#ADDRESSES[@]} -eq 0 ]]; then
  if [[ ! -t 0 ]]; then
    # Read from stdin
    while IFS= read -r line || [[ -n "$line" ]]; do
      # Extract hex addresses from line
      while [[ "$line" =~ (0x[a-fA-F0-9]{40}) ]]; do
        ADDRESSES+=("${BASH_REMATCH[1]}")
        line="${line#*${BASH_REMATCH[1]}}"
      done
    done
  fi
fi

if [[ ${#ADDRESSES[@]} -eq 0 ]]; then
  echo "Error: No addresses provided." >&2
  usage
  exit 2
fi

# Remove duplicates
readarray -t UNIQUE_ADDRESSES < <(printf '%s\n' "${ADDRESSES[@]}" | sort -u)

# Function to check if agent is alive using cast
check_agent_alive() {
  local agent="$1"
  local status
  local last_pulse
  local current_time
  local seconds_since

  # Call getAgentStatus
  status=$(cast call --rpc-url "$RPC_URL" \
    "$REGISTRY_ADDRESS" \
    "getAgentStatus(address)(bool,uint256,uint256,uint256)" \
    "$agent" 2>/dev/null) || {
    echo "ERROR: Failed to query $agent" >&2
    return 1
  }

  # Parse output: alive (bool), lastPulseAt (uint256), streak (uint256), hazard (uint256)
  # cast returns: true/false for bool, numbers for uint
  local alive
  local last_pulse_at
  
  alive=$(echo "$status" | awk '{print $1}')
  last_pulse_at=$(echo "$status" | awk '{print $2}')

  if [[ "$alive" != "true" ]]; then
    return 1
  fi

  # Check threshold
  current_time=$(date +%s)
  seconds_since=$((current_time - last_pulse_at))

  if [[ $seconds_since -le $THRESHOLD ]]; then
    echo "$agent"
    return 0
  else
    return 1
  fi
}

# Function to get full status
check_agent_status() {
  local agent="$1"
  local status
  local alive
  local last_pulse_at
  local streak
  local hazard

  status=$(cast call --rpc-url "$RPC_URL" \
    "$REGISTRY_ADDRESS" \
    "getAgentStatus(address)(bool,uint256,uint256,uint256)" \
    "$agent" 2>/dev/null) || {
    echo '{"address":"'$agent'","error":"query_failed"}'
    return 1
  }

  alive=$(echo "$status" | awk '{print $1}')
  last_pulse_at=$(echo "$status" | awk '{print $2}')
  streak=$(echo "$status" | awk '{print $3}')
  hazard=$(echo "$status" | awk '{print $4}')

  local is_alive=false
  [[ "$alive" == "true" ]] && is_alive=true

  local current_time
  current_time=$(date +%s)
  local seconds_since=$((current_time - last_pulse_at))
  local within_threshold=false
  [[ $seconds_since -le $THRESHOLD ]] && within_threshold=true

  printf '{"address":"%s","alive":%s,"withinThreshold":%s,"secondsSincePulse":%s,"lastPulseAt":%s,"streak":%s,"hazardScore":%s}' \
    "$agent" \
    "$is_alive" \
    "$within_threshold" \
    "$seconds_since" \
    "$last_pulse_at" \
    "$streak" \
    "$hazard"
}

# Process addresses
ALIVE_ADDRESSES=()
JSON_RESULTS=()

for agent in "${UNIQUE_ADDRESSES[@]}"; do
  # Validate address format
  if [[ ! "$agent" =~ ^0x[a-fA-F0-9]{40}$ ]]; then
    if [[ "$OUTPUT_JSON" == true ]]; then
      JSON_RESULTS+=("{\"address\":\"$agent\",\"error\":\"invalid_address\"}")
    fi
    continue
  fi

  if [[ "$OUTPUT_JSON" == true ]]; then
    result=$(check_agent_status "$agent")
    JSON_RESULTS+=("$result")
    # Check if alive and within threshold
    if echo "$result" | grep -q '"alive":true' && echo "$result" | grep -q '"withinThreshold":true'; then
      ALIVE_ADDRESSES+=("$agent")
    fi
  else
    result=$(check_agent_alive "$agent")
    if [[ -n "$result" ]]; then
      ALIVE_ADDRESSES+=("$result")
    fi
  fi
done

# Output results
if [[ "$OUTPUT_JSON" == true ]]; then
  echo "{"
  echo '  "aliveAddresses": ['
  local first=true
  for addr in "${ALIVE_ADDRESSES[@]}"; do
    if [[ "$first" == true ]]; then
      first=false
      echo -n "    \"$addr\""
    else
      echo -n ", \"$addr\""
    fi
  done
  echo ""
  echo "  ],"
  echo '  "details": ['
  first=true
  for detail in "${JSON_RESULTS[@]}"; do
    if [[ "$first" == true ]]; then
      first=false
      echo "    $detail"
    else
      echo "    ,$detail"
    fi
  done
  echo "  ],"
  echo "  \"threshold\": $THRESHOLD,"
  echo "  \"totalChecked\": ${#UNIQUE_ADDRESSES[@]},"
  echo "  \"aliveCount\": ${#ALIVE_ADDRESSES[@]},"
  echo "  \"timestamp\": $(date +%s)"
  echo "}"
else
  for addr in "${ALIVE_ADDRESSES[@]}"; do
    echo "$addr"
  done
fi
