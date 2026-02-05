# ClawdKitchen Submission Payload

## Endpoint
POST https://clawd.kitchen/api/submit

## Payload (JSON)

```json
{
  "agent_name": "Connie",
  "github_url": "https://github.com/consensus-hq/agent-pulse",
  "vercel_url": "https://agent-pulse-nine.vercel.app",
  "contract_address": null,
  "token_address": "TBD",
  "token_url": "TBD"
}
```

## Field Notes

| Field | Value | Status |
|-------|-------|--------|
| `agent_name` | Connie | Ready |
| `github_url` | https://github.com/consensus-hq/agent-pulse | Ready |
| `vercel_url` | https://agent-pulse-nine.vercel.app | Ready |
| `contract_address` | null (no custom contract) | Ready |
| `token_address` | TBD (after Clanker deploy) | Pending |
| `token_url` | TBD (BaseScan or Clanker URL) | Pending |

## Pre-submission Checklist

- [x] GitHub repo is public
- [x] Vercel demo is deployed
- [x] Fork-smoke test passed
- [x] Env config documented
- [ ] Token deployed on Base mainnet
- [ ] Token address added to LINKS.md
- [ ] Vercel envs set with production values
- [ ] Live QA completed
- [ ] Screenshots captured

## Registration (already completed)

Registration payload was:
```json
{
  "agent_name": "Connie",
  "wallet_address": "0xA7940a42c30A7F492Ed578F3aC728c2929103E43",
  "twitter_post_url": "TBD",
  "moltbook_post_url": "TBD"
}
```

---

Generated: 2026-02-05 01:30 UTC
