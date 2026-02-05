#!/bin/bash
# Set Vercel environment variables for agent-pulse
# Run this script with Vercel CLI installed and authenticated
# Source: docs/VERCEL_ENV_CONFIG.md

set -e

PROJECT="agent-pulse"

# Required (Client-side)
vercel env add NEXT_PUBLIC_NETWORK_LABEL production <<< "Base chain"
vercel env add NEXT_PUBLIC_CHAIN_ID production <<< "8453"
vercel env add NEXT_PUBLIC_SIGNAL_SINK_ADDRESS production <<< "0x000000000000000000000000000000000000dEaD"
vercel env add NEXT_PUBLIC_TREASURY_SAFE_ADDRESS production <<< "0xA7940a42c30A7F492Ed578F3aC728c2929103E43"
vercel env add NEXT_PUBLIC_BASE_RPC_URL production <<< "https://mainnet.base.org"
vercel env add NEXT_PUBLIC_IDENTITY_REGISTRY_ADDRESS production <<< "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432"
vercel env add NEXT_PUBLIC_REPUTATION_REGISTRY_ADDRESS production <<< "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63"
vercel env add NEXT_PUBLIC_ERC8004_REGISTER_URL production <<< "https://www.8004.org"
vercel env add NEXT_PUBLIC_ALIVE_WINDOW_SECONDS production <<< "86400"
vercel env add NEXT_PUBLIC_INBOX_KEY_TTL_SECONDS production <<< "3600"
vercel env add NEXT_PUBLIC_EXPLORER_TX_BASE_URL production <<< "https://basescan.org/tx/"
vercel env add NEXT_PUBLIC_PULSE_FEED_URL production <<< "/pulse-feed.json"

# Required (Server-side)
vercel env add BASE_RPC_URL production <<< "https://mainnet.base.org"
vercel env add SIGNAL_SINK_ADDRESS production <<< "0x000000000000000000000000000000000000dEaD"
vercel env add ALIVE_WINDOW_SECONDS production <<< "86400"
vercel env add INBOX_KEY_TTL_SECONDS production <<< "3600"
vercel env add BLOCK_CONFIRMATIONS production <<< "2"
vercel env add BLOCK_TIME_SECONDS production <<< "2"
vercel env add REQUIRE_ERC8004 production <<< "false"

# Last-run metadata
vercel env add NEXT_PUBLIC_LAST_RUN_STATUS production <<< "pass"
vercel env add NEXT_PUBLIC_LAST_RUN_TS production <<< "2026-02-05T00:30:00Z"
vercel env add NEXT_PUBLIC_LAST_RUN_NETWORK production <<< "Base fork"
vercel env add NEXT_PUBLIC_LAST_RUN_LOG production <<< "fork-smoke: direct transfer 0.05 WETH to burn sink OK"

echo "Vercel envs set. Token address vars still TBD (add after Clanker deploy):"
echo "  - NEXT_PUBLIC_PULSE_TOKEN_ADDRESS"
echo "  - PULSE_TOKEN_ADDRESS"
echo "  - NEXT_PUBLIC_PULSE_REGISTRY_ADDRESS"
