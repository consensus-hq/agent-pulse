#!/bin/bash
# Set Vercel environment variables for Agent Pulse deployment
# Usage: PULSE_TOKEN=0x... PULSE_REGISTRY=0x... ./scripts/set-vercel-env.sh
# Requires: vercel CLI authenticated (run 'vercel login' first)

set -e

# Check if vercel CLI is installed
if ! command -v vercel &> /dev/null; then
    echo "❌ Error: vercel CLI is not installed"
    echo "Install it with: npm i -g vercel"
    exit 1
fi

# Check if logged in
if ! vercel whoami &> /dev/null; then
    echo "❌ Error: Not logged in to Vercel"
    echo "Run: vercel login"
    exit 1
fi

# Get deployment addresses from environment or DEPLOYMENT.json
PULSE_TOKEN="${PULSE_TOKEN:-}"
PULSE_REGISTRY="${PULSE_REGISTRY:-}"

# Try to load from DEPLOYMENT.json if not provided
if [ -z "$PULSE_TOKEN" ] || [ -z "$PULSE_REGISTRY" ]; then
    DEPLOYMENT_FILE="${DEPLOYMENT_FILE:-./DEPLOYMENT.json}"
    if [ -f "$DEPLOYMENT_FILE" ]; then
        echo "ℹ Loading addresses from $DEPLOYMENT_FILE"
        if [ -z "$PULSE_TOKEN" ]; then
            PULSE_TOKEN=$(jq -r '.pulseToken.address' "$DEPLOYMENT_FILE" 2>/dev/null || echo "")
        fi
        if [ -z "$PULSE_REGISTRY" ]; then
            PULSE_REGISTRY=$(jq -r '.pulseRegistry.address' "$DEPLOYMENT_FILE" 2>/dev/null || echo "")
        fi
    fi
fi

# Validate addresses
if [ -z "$PULSE_TOKEN" ]; then
    echo "❌ Error: PULSE_TOKEN not set"
    echo "Usage: PULSE_TOKEN=0x... PULSE_REGISTRY=0x... ./scripts/set-vercel-env.sh"
    echo "Or ensure DEPLOYMENT.json exists from running deploy-all.ts"
    exit 1
fi

if [ -z "$PULSE_REGISTRY" ]; then
    echo "❌ Error: PULSE_REGISTRY not set"
    echo "Usage: PULSE_TOKEN=0x... PULSE_REGISTRY=0x... ./scripts/set-vercel-env.sh"
    echo "Or ensure DEPLOYMENT.json exists from running deploy-all.ts"
    exit 1
fi

echo "=== Setting Vercel Environment Variables ==="
echo "PULSE Token:     $PULSE_TOKEN"
echo "PulseRegistry:   $PULSE_REGISTRY"
echo ""

# Detect project settings
PROJECT_NAME="${PROJECT_NAME:-}"
if [ -z "$PROJECT_NAME" ]; then
    # Try to get from .vercel/project.json
    if [ -f ".vercel/project.json" ]; then
        PROJECT_NAME=$(jq -r '.projectId' .vercel/project.json 2>/dev/null || echo "")
    fi
fi

if [ -n "$PROJECT_NAME" ]; then
    echo "Project: $PROJECT_NAME"
    PROJECT_FLAG="--scope $PROJECT_NAME"
else
    echo "ℹ Project not specified, using current Vercel project"
    PROJECT_FLAG=""
fi

# Helper function to set env var
set_env() {
    local name="$1"
    local value="$2"
    local target="${3:-production}"
    
    echo "Setting $name..."
    if [ -n "$PROJECT_FLAG" ]; then
        echo "$value" | vercel env add "$name" "$target" $PROJECT_FLAG --yes 2>/dev/null || true
    else
        echo "$value" | vercel env add "$name" "$target" --yes 2>/dev/null || true
    fi
}

echo "=== Client-side Environment Variables ==="

# Required - Token and Registry
set_env "NEXT_PUBLIC_PULSE_TOKEN_ADDRESS" "$PULSE_TOKEN" "production"
set_env "NEXT_PUBLIC_PULSE_TOKEN_ADDRESS" "$PULSE_TOKEN" "preview"
set_env "NEXT_PUBLIC_PULSE_REGISTRY_ADDRESS" "$PULSE_REGISTRY" "production"
set_env "NEXT_PUBLIC_PULSE_REGISTRY_ADDRESS" "$PULSE_REGISTRY" "preview"

# Required - Network config (if not already set)
set_env "NEXT_PUBLIC_NETWORK_LABEL" "Base chain" "production"
set_env "NEXT_PUBLIC_CHAIN_ID" "8453" "production"
set_env "NEXT_PUBLIC_BASE_RPC_URL" "https://mainnet.base.org" "production"
set_env "NEXT_PUBLIC_SIGNAL_SINK_ADDRESS" "0x000000000000000000000000000000000000dEaD" "production"

# Alive window and inbox config
set_env "NEXT_PUBLIC_ALIVE_WINDOW_SECONDS" "86400" "production"
set_env "NEXT_PUBLIC_INBOX_KEY_TTL_SECONDS" "3600" "production"
set_env "NEXT_PUBLIC_EXPLORER_TX_BASE_URL" "https://basescan.org/tx/" "production"
set_env "NEXT_PUBLIC_PULSE_FEED_URL" "/api/pulse-feed" "production"

echo ""
echo "=== Server-side Environment Variables ==="

# Server-side mirrors
set_env "PULSE_TOKEN_ADDRESS" "$PULSE_TOKEN" "production"
set_env "PULSE_TOKEN_ADDRESS" "$PULSE_TOKEN" "preview"
set_env "PULSE_REGISTRY_ADDRESS" "$PULSE_REGISTRY" "production"
set_env "PULSE_REGISTRY_ADDRESS" "$PULSE_REGISTRY" "preview"

set_env "BASE_RPC_URL" "https://mainnet.base.org" "production"
set_env "SIGNAL_SINK_ADDRESS" "0x000000000000000000000000000000000000dEaD" "production"
set_env "ALIVE_WINDOW_SECONDS" "86400" "production"
set_env "INBOX_KEY_TTL_SECONDS" "3600" "production"
set_env "BLOCK_CONFIRMATIONS" "2" "production"
set_env "BLOCK_TIME_SECONDS" "2" "production"
set_env "REQUIRE_ERC8004" "false" "production"

echo ""
echo "=== Optional Identity Registry (ERC-8004) ==="
# These can be left empty or set later
# set_env "NEXT_PUBLIC_IDENTITY_REGISTRY_ADDRESS" "" "production"
# set_env "NEXT_PUBLIC_ERC8004_REGISTER_URL" "https://www.8004.org" "production"

echo ""
echo "✅ Environment variables set successfully!"
echo ""
echo "=== Next Steps ==="
echo "1. Deploy to Vercel:"
echo "   vercel --prod"
echo ""
echo "2. Verify the deployment:"
echo "   curl https://your-app.vercel.app/api/status/$PULSE_REGISTRY"
echo ""
echo "3. Test the pulse feed:"
echo "   curl https://your-app.vercel.app/api/pulse-feed"
