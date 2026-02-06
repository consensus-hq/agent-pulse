# Incident Playbook — Agent Pulse

> What to do when things go wrong. No freelancing — follow the runbook.

---

## Budget Kill Switches

| Threshold | Action | Trigger |
|-----------|--------|---------|
| **$1.00/day spend** | ⚠️ WARNING — alert operator, review logs | Automated monitor or manual check |
| **$0.50/day remaining** | 🔴 CRITICAL — switch to **cache-only mode** | Disable all live RPC/API calls; serve only cached data |
| **$0.00 budget** | 🛑 FULL STOP — disable x402 endpoints, halt keeper | No outbound transactions of any kind |

**Cache-only mode:** All `/api/v2/` endpoints serve cached responses (≤1h stale). `isAlive()` continues from cache. No new chain reads. No HeyElsa API calls. Revenue collection continues (inbound x402 payments still accepted).

---

## Incident 1: Secret / Key Leak

**Severity:** P0 — Critical

### If Deployer Key (`0x9508...1e04`) is compromised:
1. **Immediately** transfer contract ownership to Safe (`0xA794...3E43`) if not already done
2. Revoke deployer from all contract admin roles
3. Rotate any co-located secrets
4. Post-mortem within 24h

### If `THIRDWEB_SECRET_KEY` is compromised:
1. Rotate key in Thirdweb dashboard immediately
2. Update Vercel env vars
3. Redeploy
4. Audit Server Wallet (`0xdf42...0cEF`) for unauthorized transactions

### If `HEYELSA_PAYMENT_KEY` is compromised:
1. Rotate in HeyElsa dashboard
2. Update Vercel env vars
3. Redeploy
4. Check USDC spend on the key — dispute unauthorized charges

### General key leak procedure:
1. **Rotate** the compromised secret
2. **Audit** all transactions/calls made with that secret
3. **Update** env vars in Vercel + any other deployment targets
4. **Redeploy** affected services
5. **Document** in `memory/` with date and root cause

---

## Incident 2: Wallet Drain

**Severity:** P0 — Critical

### If Server Wallet is drained:
1. Revoke Thirdweb Engine access to the wallet
2. Switch to cache-only mode (kill switch)
3. Audit: Was it a Thirdweb compromise or our code?
4. Do NOT refund from treasury without multi-sig approval

### If Fee Wallet accumulation stops:
1. Check BurnWithFee contract — is it still routing 1% correctly?
2. Check if contract is paused or ownership changed
3. Verify on BaseScan

### If Treasury Safe is targeted:
1. Multi-sig should prevent unilateral drain
2. If a signer key is compromised, remove that signer via remaining signers
3. Move funds to a new Safe if needed

---

## Incident 3: Contract Bug

**Severity:** P0–P1 depending on exploitability

### If BurnWithFee has a bug:
1. **Pause** the contract (if pause function exists)
2. Switch frontend to direct-burn mode (skip fee wrapper)
3. Deploy patched contract
4. Migrate frontend to new address
5. Update LINKS.md

### If PulseRegistry has a bug:
1. Pause if possible
2. Cache last known good state
3. Deploy fix, migrate

### If token contract has a bug:
1. This is catastrophic — no migration path for ERC-20
2. Pause transfers if function exists
3. Snapshot balances
4. Deploy new token + airdrop (last resort)

---

## Incident 4: API / Hosting Down

**Severity:** P2

1. Check Vercel status page
2. If Vercel is down, nothing to do — wait
3. If our code crashed, check Vercel logs → fix → redeploy
4. `isAlive()` callers will get errors — this is expected; they should retry
5. x402 payments will fail gracefully (no charges without responses)

---

## Escalation

| Severity | Response Time | Who |
|----------|--------------|-----|
| P0 — Critical | Immediate | Operator (Connie) — drop everything |
| P1 — High | < 4 hours | Operator |
| P2 — Medium | < 24 hours | Operator or agent |
| P3 — Low | Next session | Anyone |

---

## Post-Incident

Every P0/P1 gets a written post-mortem in `REPORTS/security/` within 48 hours:
- Timeline of events
- Root cause
- What was done
- What changes prevent recurrence
