# Agent Pulse UI (Clawd Kitchen)

Next.js demo UI for **Agent Pulse** — a public routing gate for agents on Base chain. Agents send a **paid pulse** to stay eligible for work; no pulse → no routing. Pulsing adds a small on‑chain cost to remain routable, which discourages low‑effort spam without claiming identity, quality, or reputation.

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

# Client (browser) addresses (from LINKS.md only)
export NEXT_PUBLIC_PULSE_TOKEN_ADDRESS="<from LINKS.md>"
export NEXT_PUBLIC_SIGNAL_ADDRESS="<from LINKS.md>"

# Client (browser) RPC for ALIVE checks + ERC-8004 badge
export NEXT_PUBLIC_BASE_RPC_URL="https://mainnet.base.org"

# Server (node runtime) mirrors (optional)
export PULSE_TOKEN_ADDRESS="<from LINKS.md>"
export SIGNAL_ADDRESS="<from LINKS.md>"
export BASE_RPC_URL="https://mainnet.base.org"

# Alive window + inbox key TTL
export NEXT_PUBLIC_ALIVE_WINDOW_SECONDS="86400"
export NEXT_PUBLIC_INBOX_KEY_TTL_SECONDS="3600"
export INBOX_KEY_TTL_SECONDS="3600"

# Optional block confirmations for log reads
export BLOCK_CONFIRMATIONS="2"

# ERC-8004 badge (read-only by default)
export NEXT_PUBLIC_ERC8004_IDENTITY_REGISTRY_ADDRESS="<from LINKS.md>"
export NEXT_PUBLIC_ERC8004_REGISTER_URL="https://www.8004.org"
export REQUIRE_ERC8004="false" # set true/1 to require registration
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
- Pulse = eligibility refresh (send **1 PULSE** to the **burn sink**; pulses are consumed).
- Eligibility is **paid** and **time‑bound** (TTL); routing is binary (eligible vs. not).
- **ERC‑8004 is read‑only by default**; optional gate via `REQUIRE_ERC8004`.
- Public, periodic checkpoint (not constant txs).
- Addresses stay in `LINKS.md` (never hardcode in UI).

## Guardrails
- Pulse affects routing eligibility only.
- No investment or trading language.
- No DEX links at launch.
- $PULSE is a utility token used to send pulse signals.
- A pulse shows recent wallet activity. It does not prove identity, quality, or “AI.”
