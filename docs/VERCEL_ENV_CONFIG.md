# Vercel Environment Variables

Set these in the Vercel dashboard for the `agent-pulse` project.

## Required (Client-side)

| Variable | Value | Notes |
|----------|-------|-------|
| `NEXT_PUBLIC_NETWORK_LABEL` | `Base chain` | Display label |
| `NEXT_PUBLIC_CHAIN_ID` | `8453` | Base mainnet |
| `NEXT_PUBLIC_SIGNAL_SINK_ADDRESS` | `0x000000000000000000000000000000000000dEaD` | Burn sink |
| `NEXT_PUBLIC_TREASURY_SAFE_ADDRESS` | `0xA7940a42c30A7F492Ed578F3aC728c2929103E43` | Treasury Safe |
| `NEXT_PUBLIC_BASE_RPC_URL` | `https://mainnet.base.org` | Public RPC |
| `NEXT_PUBLIC_IDENTITY_REGISTRY_ADDRESS` | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` | ERC-8004 Identity |
| `NEXT_PUBLIC_REPUTATION_REGISTRY_ADDRESS` | `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` | ERC-8004 Reputation |
| `NEXT_PUBLIC_ERC8004_REGISTER_URL` | `https://www.8004.org` | Registration CTA |
| `NEXT_PUBLIC_ALIVE_WINDOW_SECONDS` | `86400` | 24h TTL |
| `NEXT_PUBLIC_INBOX_KEY_TTL_SECONDS` | `3600` | 1h inbox key |
| `NEXT_PUBLIC_EXPLORER_TX_BASE_URL` | `https://basescan.org/tx/` | Explorer links |
| `NEXT_PUBLIC_PULSE_FEED_URL` | `/pulse-feed.json` | Feed endpoint |

## Required (Server-side)

| Variable | Value | Notes |
|----------|-------|-------|
| `BASE_RPC_URL` | `https://mainnet.base.org` | Server RPC |
| `SIGNAL_SINK_ADDRESS` | `0x000000000000000000000000000000000000dEaD` | Burn sink |
| `ALIVE_WINDOW_SECONDS` | `86400` | 24h TTL |
| `INBOX_KEY_TTL_SECONDS` | `3600` | 1h inbox key |
| `BLOCK_CONFIRMATIONS` | `2` | Log read confirmations |
| `BLOCK_TIME_SECONDS` | `2` | Base block time |
| `REQUIRE_ERC8004` | `false` | Gate disabled by default |

## Pending (TBD after token deploy)

| Variable | Notes |
|----------|-------|
| `NEXT_PUBLIC_PULSE_TOKEN_ADDRESS` | Set after Clanker deploy |
| `PULSE_TOKEN_ADDRESS` | Server mirror |
| `NEXT_PUBLIC_PULSE_REGISTRY_ADDRESS` | Set after PulseRegistry deploy |

## Optional (Last-run metadata)

| Variable | Value | Notes |
|----------|-------|-------|
| `NEXT_PUBLIC_LAST_RUN_STATUS` | `pending` | Update after fork test |
| `NEXT_PUBLIC_LAST_RUN_TS` | `pending` | Timestamp of last test |
| `NEXT_PUBLIC_LAST_RUN_NETWORK` | `Base chain` | Network label |
| `NEXT_PUBLIC_LAST_RUN_LOG` | `` | Log URL or summary |

## Optional (WalletConnect / KV / API keys)

| Variable | Notes |
|----------|-------|
| `NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID` | WalletConnect v2 project ID |
| `KV_URL` | Vercel KV URL |
| `KV_REST_API_URL` | Vercel KV REST URL |
| `KV_REST_API_TOKEN` | Vercel KV token |
| `ETHERSCAN_API_KEY` | BaseScan API key |
| `PRIVATE_KEY` | Deploy key (do not commit) |

---

Generated: 2026-02-05 00:15 UTC
