#!/bin/bash
# Update Vercel environment variables for Agent Pulse mainnet deployment
# RUN ONLY AFTER AUDIT APPROVAL
#
# New Clanker token: 0x21111B39A502335aC7e45c4574Dd083A69258b07
# New PulseRegistryV2: 0xe61C615743A02983A46aFF66Db035297e8a43846
# New PeerAttestation: 0x930dC6130b20775E01414a5923e7C66b62FF8d6C
# New BurnWithFee: 0xd38cC332ca9755DE536841f2A248f4585Fb08C1E

set -euo pipefail

VERCEL_TOKEN=$(op item get "Vercel API Token (connie-cli-deploy)" --vault "Connie-Automation" --format json | jq -r '.fields[] | select(.type == "CONCEALED") | .value')
PROJECT_ID="prj_MJbrVNg9iTlJeWA8RvzruEQhrj2i"
TEAM_ID="team_ZRKFcJLvGu80oAsUuSPyGb3G"
BASE_URL="https://api.vercel.com/v9/projects/$PROJECT_ID/env"

# Helper: get env var ID by key and target
get_env_id() {
  local key=$1
  local target=${2:-production}
  curl -s -H "Authorization: Bearer $VERCEL_TOKEN" \
    "$BASE_URL?teamId=$TEAM_ID" | \
    jq -r ".envs[] | select(.key == \"$key\" and (.target | index(\"$target\"))) | .id" | head -1
}

# Helper: update or create env var
upsert_env() {
  local key=$1
  local value=$2
  local target=${3:-production}
  
  local env_id=$(get_env_id "$key" "$target")
  
  if [ -n "$env_id" ]; then
    echo "Updating $key = $value (target: $target)"
    curl -s -X PATCH -H "Authorization: Bearer $VERCEL_TOKEN" \
      -H "Content-Type: application/json" \
      -d "{\"value\": \"$value\"}" \
      "$BASE_URL/$env_id?teamId=$TEAM_ID" | jq -r '.key + " updated"'
  else
    echo "Creating $key = $value (target: $target)"
    curl -s -X POST -H "Authorization: Bearer $VERCEL_TOKEN" \
      -H "Content-Type: application/json" \
      -d "{\"key\": \"$key\", \"value\": \"$value\", \"target\": [\"$target\"], \"type\": \"plain\"}" \
      "$BASE_URL?teamId=$TEAM_ID" | jq -r '.created.key + " created"'
  fi
}

echo "=== Updating Vercel Env Vars for Agent Pulse Mainnet ==="
echo ""

# Core contract addresses (production)
upsert_env "NEXT_PUBLIC_PULSE_TOKEN_ADDRESS" "0x21111B39A502335aC7e45c4574Dd083A69258b07"
upsert_env "PULSE_TOKEN_ADDRESS" "0x21111B39A502335aC7e45c4574Dd083A69258b07"
upsert_env "NEXT_PUBLIC_PULSE_REGISTRY_ADDRESS" "0xe61C615743A02983A46aFF66Db035297e8a43846"
upsert_env "PULSE_REGISTRY_ADDRESS" "0xe61C615743A02983A46aFF66Db035297e8a43846"
upsert_env "NEXT_PUBLIC_PEER_ATTESTATION_ADDRESS" "0x930dC6130b20775E01414a5923e7C66b62FF8d6C"
upsert_env "NEXT_PUBLIC_BURN_WITH_FEE_ADDRESS" "0xd38cC332ca9755DE536841f2A248f4585Fb08C1E"

# Mainnet chain ID
upsert_env "CHAIN_ID" "8453"
upsert_env "NEXT_PUBLIC_CHAIN_ID" "8453"

# Mainnet-specific addresses
upsert_env "NEXT_PUBLIC_PULSE_TOKEN_MAINNET" "0x21111B39A502335aC7e45c4574Dd083A69258b07"
upsert_env "NEXT_PUBLIC_PULSE_REGISTRY_MAINNET" "0xe61C615743A02983A46aFF66Db035297e8a43846"

echo ""
echo "=== Done. Trigger redeploy with: npx vercel --prod --token $VERCEL_TOKEN ==="
