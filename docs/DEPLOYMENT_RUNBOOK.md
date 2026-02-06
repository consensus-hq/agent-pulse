# Deployment Runbook — Agent Pulse v4

---

## Guardrails

- **Addresses live only in `LINKS.md`.** Do not paste addresses into docs, README, or code.
- **No DEX links at launch.**
- **Mainnet requires funding.** If deployer wallet is not funded, stop after testnet steps.

---

## 1. Smart Contract Deployment

### BurnWithFee Wrapper

The BurnWithFee contract wraps PULSE burns with the v4 fee split:

```bash
cd packages/contracts

# Deploy BurnWithFee
forge create contracts/BurnWithFee.sol:BurnWithFee \
  --constructor-args ${PULSE_TOKEN_ADDR} ${BURN_ADDRESS} ${FEE_WALLET_ADDR} \
  --rpc-url ${RPC_URL} \
  --private-key ${PRIVATE_KEY}

# Verify
forge verify-contract ${BURNWITHFEE_ADDR} BurnWithFee \
  --chain ${CHAIN_ID} \
  --constructor-args $(cast abi-encode "constructor(address,address,address)" \
    ${PULSE_TOKEN_ADDR} ${BURN_ADDRESS} ${FEE_WALLET_ADDR})
```

Fee split (immutable in contract):
- 98.7% → burn address (0xdead)
- 0.3% → Thirdweb platform fee
- 1.0% → Infrastructure Fee Wallet

### PulseRegistryV2

```bash
forge create contracts/PulseRegistryV2.sol:PulseRegistryV2 \
  --constructor-args ${PULSE_TOKEN_ADDR} ${BURNWITHFEE_ADDR} 86400 1000000000000000000 \
  --rpc-url ${RPC_URL} \
  --private-key ${PRIVATE_KEY}
```

### PeerAttestation

```bash
forge create contracts/PeerAttestation.sol:PeerAttestation \
  --constructor-args ${REGISTRY_ADDR} \
  --rpc-url ${RPC_URL} \
  --private-key ${PRIVATE_KEY}
```

### Post-Deploy Verification

```bash
# Verify all contracts on BaseScan
forge verify-contract ${ADDR} ContractName --chain ${CHAIN_ID}

# Smoke test
cast call ${REGISTRY_ADDR} "ttlSeconds()(uint256)" --rpc-url ${RPC_URL}
# Expected: 86400

cast call ${REGISTRY_ADDR} "minPulseAmount()(uint256)" --rpc-url ${RPC_URL}
# Expected: 1000000000000000000
```

Update `LINKS.md` with all deployed addresses.

---

## 2. Thirdweb Server Wallet Setup

The Thirdweb server wallet receives x402 payments and facilitates payment verification.

1. **Create server wallet** at [thirdweb.com/dashboard](https://thirdweb.com/dashboard)
2. **Fund with gas** — small amount of ETH on Base for transaction fees
3. **Note the wallet address** — this is `THIRDWEB_SERVER_WALLET_ADDRESS`
4. **Get secret key** — this is `THIRDWEB_SECRET_KEY`

The server wallet is used by `x402-gate.ts` to:
- Verify incoming x402 payments
- Confirm payment settlement on Base
- No manual payment handling needed

---

## 3. Vercel Environment Variables

Set in Vercel dashboard (Settings → Environment Variables):

### Required

| Variable | Description | Example |
|----------|-------------|---------|
| `THIRDWEB_SECRET_KEY` | Thirdweb API authentication | `tw_...` |
| `THIRDWEB_SERVER_WALLET_ADDRESS` | x402 payment receiving wallet | `0x...` |
| `BASE_RPC_URL` | Base chain RPC | `https://sepolia.base.org` |
| `NEXT_PUBLIC_BASE_RPC_URL` | Client-side RPC | `https://sepolia.base.org` |
| `PULSE_TOKEN_ADDRESS` | PULSE token contract | From LINKS.md |
| `NEXT_PUBLIC_PULSE_TOKEN_ADDRESS` | Client-side token address | From LINKS.md |
| `PULSE_REGISTRY_ADDRESS` | PulseRegistryV2 contract | From LINKS.md |
| `NEXT_PUBLIC_PULSE_REGISTRY_ADDRESS` | Client-side registry | From LINKS.md |
| `BURNWITHFEE_ADDRESS` | BurnWithFee wrapper contract | From LINKS.md |
| `SIGNAL_ADDRESS` | Burn address (0xdead) | From LINKS.md |
| `NEXT_PUBLIC_SIGNAL_ADDRESS` | Client-side burn address | From LINKS.md |

### Cache & Rate Limiting

| Variable | Description | Default |
|----------|-------------|---------|
| `KV_REST_API_URL` | Vercel KV endpoint | Auto-configured |
| `KV_REST_API_TOKEN` | Vercel KV auth | Auto-configured |

### HeyElsa (DeFi Panel)

| Variable | Description |
|----------|-------------|
| `HEYELSA_API_URL` | HeyElsa x402 API endpoint |
| `HEYELSA_WALLET_KEY` | Payment wallet private key for HeyElsa calls |

### Optional

| Variable | Description | Default |
|----------|-------------|---------|
| `NEXT_PUBLIC_ALIVE_WINDOW_SECONDS` | TTL for alive checks | `86400` |
| `REQUIRE_ERC8004` | Require ERC-8004 badge | `false` |
| `NEXT_PUBLIC_IDENTITY_REGISTRY_ADDRESS` | ERC-8004 registry | — |

---

## 4. Contract Addresses

All addresses stored in `LINKS.md`. Current deployments:

### Base Sepolia (Testnet)

| Contract | Notes |
|----------|-------|
| PulseToken | ERC-20, verified on BaseScan |
| PulseRegistryV2 | 65 tests passing |
| BurnWithFee | 33 tests passing |
| PeerAttestation | Peer attestation |
| Burn Address | `0x000000000000000000000000000000000000dEaD` |

See `LINKS.md` for actual addresses.

---

## 5. Deployment Steps

### Testnet (Base Sepolia)

1. Deploy contracts (Section 1)
2. Update `LINKS.md` with addresses
3. Set Vercel env vars (Section 3)
4. Push to GitHub → Vercel auto-deploys
5. Smoke test:
   ```bash
   # Free endpoint
   curl https://agent-pulse-nine.vercel.app/api/v2/agent/0x.../alive

   # Health check
   curl https://agent-pulse-nine.vercel.app/api/internal/health
   ```

### Mainnet (Base)

**Prerequisites:**
- All testnet smoke tests pass
- Deployer wallet funded with ETH on Base mainnet
- Treasury Safe confirmed as fee recipient
- Thirdweb server wallet funded on Base mainnet

1. Deploy contracts to Base mainnet with same parameters
2. Verify on BaseScan
3. Update `LINKS.md` with mainnet addresses
4. Switch Vercel env vars to mainnet values
5. Production smoke test

---

## 6. Post-Deploy Checklist

- [ ] All contracts verified on BaseScan
- [ ] `LINKS.md` updated with all addresses
- [ ] Vercel env vars set correctly
- [ ] Free endpoint returns data
- [ ] Paid endpoint returns 402 without payment
- [ ] Health endpoint returns OK
- [ ] No addresses in docs/README/code (only in LINKS.md + env vars)
- [ ] `NEXT_PUBLIC_LAST_RUN_*` updated for UI
