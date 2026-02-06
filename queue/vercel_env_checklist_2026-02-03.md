# Vercel env checklist (agent-pulse / apps/web)

## Display + labels (client)
- NEXT_PUBLIC_NETWORK_LABEL="Base chain"
- NEXT_PUBLIC_LAST_RUN_STATUS="pending" (update after checked run)
- NEXT_PUBLIC_LAST_RUN_TS="—"
- NEXT_PUBLIC_LAST_RUN_NETWORK="Base chain"
- NEXT_PUBLIC_LAST_RUN_LOG=""
- NEXT_PUBLIC_LAST_RUN_LABEL="pending" (optional)
- NEXT_PUBLIC_PULSE_FEED_URL="/pulse-feed.json" (optional)
- NEXT_PUBLIC_EXPLORER_TX_BASE_URL="https://basescan.org/tx/"

## Pulse + sink (client)
- NEXT_PUBLIC_PULSE_TOKEN_ADDRESS="<from LINKS.md>"
- NEXT_PUBLIC_SIGNAL_ADDRESS="<from LINKS.md>" (signal sink)

## Pulse + sink (server)
- PULSE_TOKEN_ADDRESS="<from LINKS.md>"
- SIGNAL_ADDRESS="<from LINKS.md>" (signal sink)

## RPC (client + server)
- NEXT_PUBLIC_BASE_RPC_URL="https://mainnet.base.org"
- BASE_RPC_URL="https://mainnet.base.org" (server mirror)

## ALIVE + inbox
- NEXT_PUBLIC_ALIVE_WINDOW_SECONDS="86400" (demo: 120)
- NEXT_PUBLIC_INBOX_KEY_TTL_SECONDS="3600"
- INBOX_KEY_TTL_SECONDS="3600" (server mirror)
- BLOCK_CONFIRMATIONS="2"
- BLOCK_TIME_SECONDS="2" (optional)

## ERC-8004 (read-only by default)
- NEXT_PUBLIC_ERC8004_IDENTITY_REGISTRY_ADDRESS="<from LINKS.md>"
- NEXT_PUBLIC_ERC8004_REGISTER_URL="https://www.8004.org"
- REQUIRE_ERC8004="false" (optional gate; set true/1 to require registration)

Notes:
- Addresses must come from `agent-pulse/LINKS.md` (single source of truth).
- No DEX links at launch.
