# HeyElsa Wallet Funding Runbook

> Server-side payment wallet setup for HeyElsa x402 DeFi integration

---

## Overview

Agent Pulse uses a dedicated hot wallet to pay HeyElsa for DeFi data via x402 micropayments. This wallet holds USDC on Base and signs EIP-3009 transfers server-side.

---

## 1. Create a Payment Wallet

### Using viem (recommended)

```bash
# Install viem if not already installed
npm install viem

# Generate a new private key
node -e "const { generatePrivateKey } = require('viem/accounts'); console.log(generatePrivateKey());"
```

### Using cast (Foundry)

```bash
cast wallet new
```

### Output

Save the private key (starts with `0x`). The corresponding address is your payment wallet address.

---

## 2. Fund with USDC on Base

### Get USDC on Base Mainnet

1. **Bridge from Ethereum:** Use [Base Bridge](https://bridge.base.org) to transfer USDC from Ethereum to Base
2. **Buy directly on Base:** Use an on-ramp that supports Base (Coinbase, etc.)
3. **Transfer from exchange:** Withdraw USDC to your payment wallet address on Base network

### Recommended Funding Amount

| Usage Level | Recommended USDC | Estimated Calls |
|-------------|------------------|-----------------|
| Demo/testing | $5 | ~500 portfolio calls |
| Production | $25 | ~2,500 portfolio calls |
| High traffic | $50+ | ~5,000+ portfolio calls |

**Note:** With 60-second caching, actual usage will be lower than raw call estimates.

### USDC Contract on Base

- **Address:** `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- **Decimals:** 6

---

## 3. Set Environment Variable in Vercel

```bash
# Using Vercel CLI
vercel env add HEYELSA_PAYMENT_KEY production
# Paste the private key when prompted

# Or via Vercel Dashboard:
# Settings → Environment Variables → Add
# Name: HEYELSA_PAYMENT_KEY
# Value: 0x... (your private key)
```

**Important:** 
- Never use `NEXT_PUBLIC_` prefix — this must remain server-side only
- Redeploy after setting the environment variable

---

## 4. Check Wallet Balance

### Using cast (Foundry)

```bash
# Check USDC balance (6 decimals)
cast call 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 \
  "balanceOf(address)(uint256)" \
  YOUR_WALLET_ADDRESS \
  --rpc-url https://mainnet.base.org

# Convert from wei (6 decimals) to human-readable
# Result ÷ 1,000,000 = USDC amount
```

### Using curl + RPC

```bash
curl -X POST https://mainnet.base.org \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "eth_call",
    "params": [{
      "to": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      "data": "0x70a08231000000000000000000000000YOUR_WALLET_ADDRESS_NO_0X"
    }, "latest"],
    "id": 1
  }'

# Decode hex response: parseInt(result, 16) / 1e6 = USDC amount
```

### View on Explorer

Visit: `https://basescan.org/address/YOUR_WALLET_ADDRESS`

---

## 5. What Happens When Wallet Runs Dry

### Behavior

1. **API returns 503:** `/api/defi` endpoints will return HTTP 503 with error:
   ```json
   { "error": "Server configuration error: Payment wallet not configured" }
   ```
   or
   ```json
   { "error": "Failed to fetch DeFi data", "message": "insufficient funds" }
   ```

2. **No data returned:** Users see error state in UI instead of DeFi data

3. **Logs indicate failure:** Server logs show payment failures

### Recovery

1. Check balance (see Section 4)
2. Fund wallet with more USDC
3. No restart required — next request will succeed

---

## 6. Rotate the Key

### When to Rotate

- Suspected compromise
- Regular security rotation
- Migration to new infrastructure

### Rotation Steps

1. **Create new wallet** (see Section 1)
2. **Fund new wallet** with USDC (see Section 2)
3. **Update environment variable:**
   ```bash
   vercel env rm HEYELSA_PAYMENT_KEY production
   vercel env add HEYELSA_PAYMENT_KEY production
   # Enter new private key
   ```
4. **Redeploy:**
   ```bash
   vercel --prod
   ```
5. **Verify:** Test `/api/defi?action=portfolio&address=0x...`
6. **Sweep old wallet** (optional): Transfer remaining USDC from old wallet to new wallet or treasury

### Zero-Downtime Rotation

To rotate without downtime:
1. Fund new wallet
2. Update env var
3. Redeploy
4. Old wallet can be retired after deployment completes

---

## Quick Reference

| Task | Command |
|------|---------|
| Generate key | `node -e "const { generatePrivateKey } = require('viem/accounts'); console.log(generatePrivateKey());"` |
| Check balance | `cast call 0x8335... "balanceOf(address)(uint256)" WALLET_ADDR --rpc-url https://mainnet.base.org` |
| Set env var | `vercel env add HEYELSA_PAYMENT_KEY production` |
| Test endpoint | `curl "https://your-app.vercel.app/api/defi?action=portfolio&address=0x..."` |

---

## Support

For issues with the HeyElsa API: [HeyElsa Documentation](https://docs.heyelsa.ai)
For x402 protocol details: [x402.org](https://www.x402.org)
