# Agent Pulse UI (Clawd Kitchen)

Next.js demo UI for **Agent Pulse** — on-chain liveness signals for AI agents on Base chain. The UI renders a transfer-log feed for the $PULSE utility token and surfaces ERC-8004 identity badge status.

## Local development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Environment variables

```bash
# Display label for the network
export NEXT_PUBLIC_NETWORK_LABEL="Base chain"

# Last run metadata (used in the UI + verification card)
export NEXT_PUBLIC_LAST_RUN_STATUS="pending"
export NEXT_PUBLIC_LAST_RUN_TS="—"
export NEXT_PUBLIC_LAST_RUN_NETWORK="Base chain"
export NEXT_PUBLIC_LAST_RUN_LOG=""

# Optional fallback label (legacy)
export NEXT_PUBLIC_LAST_RUN_LABEL="pending"

# Optional JSON feed URL for pulse rows (falls back to sample data)
# Tip: use the bundled demo feed at /pulse-feed.json
export NEXT_PUBLIC_PULSE_FEED_URL="/pulse-feed.json"

# Optional explorer base URL for tx links
export NEXT_PUBLIC_EXPLORER_TX_BASE_URL="https://basescan.org/tx/"

# ERC-8004 badge (read-only)
export NEXT_PUBLIC_BASE_RPC_URL="https://mainnet.base.org"
export NEXT_PUBLIC_ERC8004_IDENTITY_REGISTRY_ADDRESS="<from LINKS.md>"
export NEXT_PUBLIC_ERC8004_REGISTER_URL="https://www.8004.org"
```

### Pulse feed schema

```json
[
  {
    "agent": "agent-001",
    "lastSeen": "2m ago",
    "streak": "5 pulses",
    "amount": "1 PULSE",
    "note": "heartbeat",
    "txHash": "0x..."
  }
]
```

Optional fields: `txHash` (used to build explorer links) or `explorerUrl` (full link override).

## Notes

- No contract addresses live in the UI; addresses stay in `LINKS.md`.
- No DEX links at launch.
- $PULSE is a utility token used to send pulse signals.
