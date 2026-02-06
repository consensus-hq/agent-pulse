# Secret Inventory — Agent Pulse

> Every secret in the system. NO actual values in this file — ever.

---

## Secret Catalog

| Secret | Purpose | Storage | Risk | Blast Radius |
|--------|---------|---------|------|-------------|
| **Deployer Private Key** | Signs contract deployments; holds owner role on all contracts | Local machine only (never in any server/CI env) | 🔴 CRITICAL | Full contract takeover — can transfer ownership, pause, upgrade |
| **THIRDWEB_SECRET_KEY** | Authenticates with Thirdweb Engine for server wallet operations | Vercel env vars | 🔴 CRITICAL | Attacker can execute transactions from Server Wallet (`0xdf42...0cEF`) |
| **SERVER_WALLET_ADDRESS** | Public address of the Thirdweb-managed server wallet | Vercel env vars | 🟢 LOW | Public info — no private key exposure. Used for config, not auth. |
| **HEYELSA_PAYMENT_KEY** | Authenticates x402 payments to HeyElsa DeFi API | Vercel env vars | 🟡 HIGH | Attacker can drain our HeyElsa USDC prepay balance; no access to our wallets |
| **VERCEL_TOKEN** | Deploys and manages Vercel project | Local CLI / GitHub Actions (if used) | 🟡 HIGH | Can redeploy with malicious code; can read env vars |
| **NEXT_PUBLIC_THIRDWEB_CLIENT_ID** | Client-side Thirdweb SDK identifier | Vercel env vars (public) | 🟢 LOW | Public by design; rate-limited; no write access |
| **BASE_RPC_URL** | RPC endpoint for Base chain reads | Vercel env vars | 🟢 LOW | Rate limit abuse; no fund access |

---

## Risk Levels

| Level | Definition | Response Time |
|-------|-----------|---------------|
| 🔴 CRITICAL | Compromise = direct fund loss or contract takeover | Immediate rotation |
| 🟡 HIGH | Compromise = service abuse or indirect fund loss | < 4 hours |
| 🟢 LOW | Compromise = minor abuse, no fund exposure | Next session |

---

## Storage Rules

1. **Deployer key** — NEVER in Vercel, NEVER in `.env` on a server, NEVER in git. Local machine only, ideally hardware wallet.
2. **All Vercel env vars** — set via Vercel dashboard, not committed to repo. `.env.local` for local dev only, in `.gitignore`.
3. **No secrets in code** — ever. Not in comments, not in TODOs, not "temporarily".
4. **No secrets in this file** — this is a catalog, not a vault.

---

## Rotation Procedures

| Secret | How to Rotate |
|--------|--------------|
| Deployer Key | Generate new key → transfer contract ownership → update WALLET_REGISTRY.md |
| THIRDWEB_SECRET_KEY | Regenerate in Thirdweb dashboard → update Vercel env → redeploy |
| HEYELSA_PAYMENT_KEY | Regenerate in HeyElsa dashboard → update Vercel env → redeploy |
| VERCEL_TOKEN | Regenerate in Vercel settings → update local CLI / CI |

---

## Audit Checklist

Run before every launch and monthly thereafter:

- [ ] No secrets in git history (`git log -p | grep -i "secret\|key\|private"`)
- [ ] `.env.local` is in `.gitignore`
- [ ] Vercel env vars match expected set (no extras, no stale keys)
- [ ] Deployer key is not on any server
- [ ] Server Wallet has budget cap configured in Thirdweb Engine
- [ ] HeyElsa prepay balance is within expected range
