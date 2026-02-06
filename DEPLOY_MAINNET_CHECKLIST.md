# Mainnet Deploy Checklist

## Pre-Deploy ✅
- [x] PR #100 merged — V2 registry, dynamic chains, Treasury Safe fees
- [x] PR #101 pending — indexer + x402 settlement chain-configurable
- [x] 202/202 contract tests pass
- [x] 98/98 API tests pass
- [x] 28/28 E2E tests pass
- [x] Fork simulation succeeded ($0.23 gas)
- [x] Wallet funded: ~$4 ETH + $48.42 USDC on Base mainnet

## Deploy Sequence

### Step 1: Deploy Contracts
```bash
export PATH="$HOME/.foundry/bin:$PATH"
cd packages/contracts
DEPLOYER_PRIVATE_KEY=$(cat /opt/fundbot/work/workspace-connie/secrets/wallets/connie.core-mainnet.key.json | jq -r .privateKey) \
forge script script/DeployMainnet.s.sol \
  --rpc-url https://mainnet.base.org \
  --broadcast \
  --verify \
  --etherscan-api-key $(op item get "basescan.org" --vault "Connie-Automation" --reveal --fields credential)
```

### Step 2: Record Deployed Addresses
Save output addresses for:
- PulseToken: 0x...
- PulseRegistryV2: 0x...
- PeerAttestation: 0x...
- BurnWithFee: 0x...

### Step 3: Verify on BaseScan
Contracts should auto-verify with `--verify` flag. Check:
https://basescan.org/address/{each_address}

### Step 4: Update Vercel Env Vars
```
CHAIN_ID=8453
NEXT_PUBLIC_CHAIN_ID=8453
NEXT_PUBLIC_PULSE_TOKEN_ADDRESS={new_token}
NEXT_PUBLIC_PULSE_REGISTRY_ADDRESS={new_registry}
NEXT_PUBLIC_REGISTRY_ADDRESS={new_registry}
NEXT_PUBLIC_PEER_ATTESTATION_ADDRESS={new_attestation}
NEXT_PUBLIC_BURN_WITH_FEE_ADDRESS={new_burnwithfee}
NEXT_PUBLIC_RPC_URL=https://mainnet.base.org
```

### Step 5: Transfer Ownership → Treasury Safe
```bash
# Each contract needs ownership transfer
cast send {registry} "transferOwnership(address)" 0xA7940a42c30A7F492Ed578F3aC728c2929103E43 --private-key $DEPLOYER_PRIVATE_KEY --rpc-url https://mainnet.base.org
cast send {burnWithFee} "transferOwnership(address)" 0xA7940a42c30A7F492Ed578F3aC728c2929103E43 --private-key $DEPLOYER_PRIVATE_KEY --rpc-url https://mainnet.base.org
cast send {token} "transferOwnership(address)" 0xA7940a42c30A7F492Ed578F3aC728c2929103E43 --private-key $DEPLOYER_PRIVATE_KEY --rpc-url https://mainnet.base.org
```

Then Romy accepts ownership on each via the Safe:
```bash
cast send {registry} "acceptOwnership()" --rpc-url https://mainnet.base.org
# (done via Safe multisig)
```

### Step 6: First Pulse (mainnet token volume)
```bash
# Approve registry to spend PULSE
cast send {token} "approve(address,uint256)" {registry} 1000000000000000000 --private-key $DEPLOYER_PRIVATE_KEY --rpc-url https://mainnet.base.org
# Send pulse
cast send {registry} "pulse(uint256)" 1000000000000000000 --private-key $DEPLOYER_PRIVATE_KEY --rpc-url https://mainnet.base.org
```

### Step 7: Sanity Check Live Endpoints
```bash
curl -s https://agent-pulse-nine.vercel.app/api/config | python3 -m json.tool
curl -s https://agent-pulse-nine.vercel.app/api/v2/agent/{deployer}/alive | python3 -m json.tool
curl -s https://agent-pulse-nine.vercel.app/api/status/{deployer} | python3 -m json.tool
```

## Post-Deploy
- [ ] Update LINKS.md with mainnet addresses
- [ ] Trigger Vercel redeploy
- [ ] Verify all endpoints return chainId 8453
- [ ] Confirm hazardScore = 0 after pulse
