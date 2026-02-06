# x402 Trust Boundaries & Security Audit Report

**Agent Pulse - Dual x402 Economy**  
**Audit Date:** 2026-02-06  
**Auditor:** SENTRY (Security & Trust Boundaries Agent)  
**Scope:** `/apps/web/` x402 micropayment infrastructure

---

## 1. Executive Summary

Agent Pulse implements a **dual x402 economy**:

1. **Consumer Side (APP → HeyElsa):** App pays HeyElsa for DeFi data using a hot wallet
2. **Producer Side (External Agents → APP):** External agents pay the app for premium API access

This audit documents secrets, trust boundaries, rate limiting, spending limits, and kill switch logic.

---

## 2. Secret Inventory

| Secret Name | Risk Level | Location | Blast Radius | Rotation Plan |
|-------------|------------|----------|--------------|---------------|
| `THIRDWEB_SECRET_KEY` | **HIGH** | Vercel env, server-only | Controls server wallet; compromise allows draining all x402 revenue | Rotate monthly; use Thirdweb dashboard to revoke old keys immediately |
| `HEYELSA_PAYMENT_KEY` | **MEDIUM** | Vercel env, server-only | Signs USDC authorizations; compromise drains hot wallet (~$1/day max exposure) | Rotate weekly; fund hot wallet with minimal USDC ($5 max) |
| `KV_REST_API_TOKEN` | **MEDIUM** | Vercel env, server-only | Read/write access to all KV data; could poison caches or expose rate limit state | Rotate via Vercel dashboard; token auto-expires on regeneration |
| `SERVER_WALLET_ADDRESS` | **LOW** | Vercel env, server-only | Not a secret (public address), but critical config; wrong address = lost revenue | Verify on deployment; compare against Thirdweb dashboard |
| `THIRDWEB_CLIENT_ID` | **LOW** | Public (NEXT_PUBLIC_) | Public client ID; used for Insight API queries only | Rotate if abuse detected; low impact |

### 2.1 Secret Blast Radius Details

#### THIRDWEB_SECRET_KEY (HIGH)
- **What it controls:** Thirdweb project access, x402 facilitator operations, server wallet
- **If leaked:** Attacker can:
  - Impersonate the app as a payment receiver
  - Query/modify Thirdweb project settings
  - Access server wallet if linked
- **Detection:** Monitor Thirdweb dashboard for unusual API calls
- **Response:** Revoke key immediately in Thirdweb dashboard; deploy new key

#### HEYELSA_PAYMENT_KEY (MEDIUM)
- **What it controls:** Hot wallet signing USDC EIP-3009 authorizations
- **If leaked:** Attacker can drain hot wallet (capped at daily budget + balance)
- **Mitigation:** Hot wallet should only hold small amounts ($5 max)
- **Detection:** Monitor daily spend in KV; alert on unusual spikes
- **Response:** Drain hot wallet to treasury; rotate key; fund new wallet

#### KV_REST_API_TOKEN (MEDIUM)
- **What it controls:** All KV read/write operations
- **If leaked:** Attacker can:
  - Read cached portfolio data (low sensitivity)
  - Poison cache with bad data
  - Manipulate rate limit counters
  - View/modify daily spend tracking
- **Detection:** Unusual KV operation patterns in Vercel logs
- **Response:** Regenerate token in Vercel dashboard

---

## 3. Trust Boundary Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              EXTERNAL AGENTS                                     │
│  (Wallets paying for API access)                                                 │
└──────────────────────┬──────────────────────────────────────────────────────────┘
                       │ x402 payment (USDC on Base)
                       │ Headers: x-payment
                       ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         AGENT PULSE APP (Next.js)                               │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │                         PAID API GATEWAY                                 │    │
│  │  /api/paid/*                                                            │    │
│  │  ├── /api/paid/portfolio   ($0.02)                                     │    │
│  │  ├── /api/paid/price/:token ($0.005)                                   │    │
│  │  └── /api/paid/health      ($0.001)                                    │    │
│  │                                                                         │    │
│  │  Auth: x402 payment verification via Thirdweb Facilitator               │    │
│  │  Secrets: THIRDWEB_SECRET_KEY, SERVER_WALLET_ADDRESS                    │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                    │                                            │
│                                    ▼                                            │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │                      HEYELSA PROXY (Consumer Side)                       │    │
│  │  /api/defi/*                                                            │    │
│  │  ├── portfolio   ($0.01 → HeyElsa)                                     │    │
│  │  ├── balances    ($0.005 → HeyElsa)                                    │    │
│  │  └── token_price ($0.002 → HeyElsa)                                    │    │
│  │                                                                         │    │
│  │  Auth: EIP-3009 USDC authorization signed by hot wallet                 │    │
│  │  Secrets: HEYELSA_PAYMENT_KEY                                           │    │
│  │  Budget: $1.00/day max                                                  │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                    │                                            │
└────────────────────────────────────┼────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              THIRDWEB FACILITATOR                                │
│  (Hosted at x402.org/facilitator or Thirdweb-hosted)                             │
│  Responsibilities:                                                                 │
│  - Verify EIP-712 signatures                                                      │
│  - Validate payment nonces (replay protection)                                    │
│  - Settle USDC transfers                                                          │
└─────────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              UPSTASH KV (Vercel)                                 │
│  Responsibilities:                                                                 │
│  - Rate limiting counters (per IP)                                                │
│  - Daily spend tracking                                                           │
│  - Response caching (60s TTL)                                                     │
│  Auth: KV_REST_API_TOKEN                                                         │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 3.1 Authentication Flow Summary

| Connection | Auth Method | Secret Used | Direction |
|------------|-------------|-------------|-----------|
| External Agent → Paid API | x402 payment header | THIRDWEB_SECRET_KEY (verification) | Inbound payment |
| App → HeyElsa | EIP-3009 authorization | HEYELSA_PAYMENT_KEY (signing) | Outbound payment |
| App → Thirdweb Facilitator | Thirdweb client | THIRDWEB_SECRET_KEY | Settlement |
| App → Upstash KV | REST API token | KV_REST_API_TOKEN | Data/cache |

---

## 4. Spending Limits & Rate Limiting

### 4.1 Consumer Side (APP → HeyElsa)

| Limit Type | Value | Implementation | Location |
|------------|-------|----------------|----------|
| **Per-call max** | $0.05 USDC | `MAX_PAYMENT_PER_CALL = 50000n` | `defi/route.ts:35` |
| **Per-day budget** | $1.00 USDC | `DAILY_BUDGET_USDC_ATOMIC = 1000000n` | `defi/route.ts:33` |
| **Rate limit (per IP)** | 10 req/min | `RATE_LIMIT_PER_MINUTE = 10` | `defi/route.ts:30` |
| **Rate limit (per IP)** | 100 req/hour | `RATE_LIMIT_PER_HOUR = 100` | `defi/route.ts:31` |
| **Cache TTL** | 60 seconds | `CACHE_TTL_SECONDS = 60` | `defi/route.ts:38` |

#### Cost Breakdown (HeyElsa)

| Endpoint | Cost | Daily Max Calls (at $1 budget) |
|----------|------|-------------------------------|
| `/api/get_portfolio` | $0.01 | 100 |
| `/api/get_balances` | $0.005 | 200 |
| `/api/get_token_price` | $0.002 | 500 |

### 4.2 Producer Side (External Agents → APP)

| Endpoint | Price | Daily Revenue (at 100 calls) |
|----------|-------|------------------------------|
| `/api/paid/portfolio` | $0.02 | $2.00 |
| `/api/paid/price/:token` | $0.005 | $0.50 |
| `/api/paid/health` | $0.001 | $0.10 |

#### Abuse Guard (Recommended Implementation)

Paid endpoints currently have **no rate limiting** (payment is the limit). Recommended addition:

```typescript
// Add to /api/paid/x402.ts or per-route
const PAID_RATE_LIMIT_PER_MINUTE = 100; // per payer address

async function checkPaidRateLimit(payer: string): Promise<boolean> {
  const key = `paid:ratelimit:${payer.toLowerCase()}:${minuteBucket}`;
  const count = await kv.get<number>(key) || 0;
  if (count >= PAID_RATE_LIMIT_PER_MINUTE) return false;
  await kv.incr(key);
  await kv.expire(key, 60);
  return true;
}
```

### 4.3 Rate Limit Response Headers

Current headers on 429 responses:
- `X-RateLimit-Limit`: Limit value
- `X-RateLimit-Remaining`: Remaining requests
- `Retry-After`: Seconds until retry

---

## 5. x402 Payment Validation Notes

### 5.1 Current Implementation

| Aspect | Current Setting | Recommendation |
|--------|-----------------|----------------|
| `maxTimeoutSeconds` | 300 (5 min) | **Increase to 3600 (1 hour)** |
| Signature verification | Thirdweb facilitator handles it | ✓ Correct |
| Replay protection | Nonce tracking via facilitator | ✓ Correct |
| Network | Base mainnet | ✓ Correct |

### 5.2 Stale Replay Protection

**Current:** `maxTimeoutSeconds: 300` in `x402.ts:147` and `pulse/route.ts`

**Risk:** Short window may cause valid payments to expire before settlement during network congestion.

**Recommendation:** Increase to 3600 seconds (1 hour):
```typescript
maxTimeoutSeconds: 3600, // Prevent stale replays, allow network delays
```

### 5.3 Facilitator Down Scenario

**Current behavior:**
- `settlePayment()` throws error
- Returns 500 to client
- Payment is NOT settled
- Client can retry with same payment header (if not expired)

**Recommended graceful degradation:**
```typescript
// Add retry logic with exponential backoff
// If facilitator down for > 30s, return 503 with retry-after header
// Monitor facilitator health separately
```

---

## 6. Kill Switch Logic

### 6.1 Implemented Protections

| Condition | Current Behavior | Location |
|-----------|------------------|----------|
| Daily budget exceeded ($1.00) | Return 503, log alert | `defi/route.ts:374-384` |
| Rate limit exceeded | Return 429 with retry headers | `defi/route.ts:345-362` |
| Payment > $0.05 | Reject with error | `defi/route.ts:222-225` |
| HEYELSA_PAYMENT_KEY missing | Return 503 | `defi/route.ts:407-412` |

### 6.2 Recommended Kill Switches (NOT IMPLEMENTED)

#### 6.2.1 Hot Wallet Balance Guard

```typescript
// Add to defi/route.ts - before payment signing
const HOT_WALLET_MIN_BALANCE = 500000n; // $0.50 USDC

async function checkHotWalletBalance(): Promise<boolean> {
  // Query USDC balance on Base
  // If < $0.50: serve cached data only, reject new HeyElsa calls
}
```

**Action on trigger:**
- Serve stale cache only (extend TTL)
- Log critical alert
- Notify ops channel

#### 6.2.2 Revenue Sustainability Alert

```typescript
// Add to daily cron or health check
const MIN_DAILY_REVENUE = 100000n; // $0.10 USDC

async function checkRevenueSustainability(): Promise<void> {
  // Query server wallet USDC received in last 24h
  // If < $0.10: alert (system may not be sustainable)
}
```

**Action on trigger:**
- Log warning alert
- Include in daily health report
- Consider scaling down HeyElsa dependency

### 6.3 Kill Switch Implementation Priority

| Priority | Switch | Effort | Impact |
|----------|--------|--------|--------|
| P0 | Hot wallet balance < $0.50 | 2h | Prevents failed payments |
| P1 | Revenue < $0.10/day | 1h | Early sustainability warning |
| P2 | Paid endpoint abuse guard | 2h | Prevents spam even if paying |

---

## 7. .gitignore Verification

### 7.1 Current .gitignore Status

**File:** `/apps/web/.gitignore`

```
# env files (can opt-in for committing if needed)
.env*
!.env.example
```

✅ **PASS**: All `.env*` files are gitignored except `.env.example`

### 7.2 Git Cache Verification

**Command:** `git ls-files --cached | grep -i env`

**Results:**
```
.codex/environments/environment.toml          ← Safe (infrastructure config)
apps/web/.env.example                         ← Safe (template, no secrets)
apps/web/next-env.d.ts                        ← Safe (Next.js types)
apps/web/scripts/check-env.ts                 ← Safe (validation script)
apps/web/src/app/lib/env.public.ts            ← Safe (public env accessor)
apps/web/src/app/lib/env.server.ts            ← Safe (server env accessor)
docs/VERCEL_ENV_CONFIG.md                     ← Safe (documentation)
packages/elizaos-plugin/src/environment.ts    ← Safe (plugin types)
queue/frontend_last_run_envs_*.md             ← Safe (run metadata)
queue/vercel_env_checklist_*.md               ← Safe (checklist)
scripts/set-vercel-env*.sh                    ← Safe (deployment scripts)
```

✅ **PASS**: No sensitive env files in git cache

### 7.3 Required Env Files (Documentation)

The following env files are used but properly excluded from git:

| File | Purpose | Location |
|------|---------|----------|
| `.env.local` | Local development secrets | Gitignored ✓ |
| `.env.production` | Production config | Gitignored ✓ |
| `.env.vercel-prod` | Vercel production env | Gitignored ✓ |

---

## 8. Recommendations Summary

### 8.1 Immediate (This Week)

1. **Increase `maxTimeoutSeconds`** from 300 to 3600 in:
   - `x402.ts:147`
   - `pulse/route.ts` (if applicable)

2. **Implement paid endpoint abuse guard** (100 req/min per payer)

3. **Verify hot wallet funding** is capped at $5 max

### 8.2 Short Term (Next 2 Weeks)

4. **Implement hot wallet balance kill switch** (< $0.50 → cached data only)

5. **Add revenue sustainability monitoring** (< $0.10/day → alert)

6. **Set up Thirdweb key rotation schedule** (monthly)

### 8.3 Ongoing

7. **Monitor daily spend** via KV stats endpoint
8. **Review rate limit rejections** weekly
9. **Audit cache hit rates** (target > 70%)

---

## 9. Appendix: Key Code References

| Component | File | Lines |
|-----------|------|-------|
| x402 payment wrapper | `api/paid/x402.ts` | 1-165 |
| HeyElsa proxy | `api/defi/route.ts` | 1-450 |
| Paid portfolio | `api/paid/portfolio/route.ts` | 1-100 |
| Paid price | `api/paid/price/[token]/route.ts` | 1-100 |
| Paid health | `api/paid/health/route.ts` | 1-120 |
| Server env | `lib/env.server.ts` | 1-15 |
| Public env | `lib/env.public.ts` | 1-20 |

---

**End of Report**
