# Alignment Track 3: Contracts & Security

**Generated:** 2026-02-06 04:38 EST  
**Analyst:** Subagent (Contract & Security Alignment)

---

## 1. Contract Inventory

| Contract | File | Purpose | Key Functions | Key Events |
|----------|------|---------|---------------|------------|
| **PulseRegistryV2** | `PulseRegistryV2.sol` | V2 registry: staking, reliability scoring, agent tiers, liveness tracking | `pulse()`, `stake()`, `unstake()`, `getReliabilityScore()`, `getAgentTier()`, `isAlive()`, `requireReliability()`, `isVerifiedAgent()` | `PulseV2`, `ReliabilityUpdate`, `Staked`, `Unstaked`, `TTLUpdated`, `MinPulseAmountUpdated` |
| **PeerAttestation** | `PeerAttestation.sol` | Peer-to-peer attestation for agent reputation; sybil-resistant rate limiting | `attest()`, `canAttest()`, `getRemainingAttestations()`, `getNetAttestationScore()`, `getAttestationStats()` | `AttestationSubmitted`, `EpochReset` |
| **BurnWithFee** | `BurnWithFee.sol` | Splits token "burn" into dead-address transfer + infrastructure fee | `burnWithFee()`, `setFeeWallet()`, `setFeeBps()`, `setMinBurn()` | `BurnExecuted`, `FeeWalletUpdated`, `FeeBpsUpdated`, `MinBurnAmountUpdated` |

**Interfaces:** `IPulseRegistryV2.sol`, `IAgentVerifiable.sol`

---

## 2. PeerAttestation Event Fields — ✅ PASS

```solidity
event AttestationSubmitted(
    address indexed attestor,   // ✅ indexed
    address indexed subject,    // ✅ indexed
    bool positive,              // ✅ present
    uint256 weight,             // ✅ present
    uint256 timestamp           // ✅ present
);
```

All five fields present with correct indexing for Graph subgraph.

---

## 3. BurnWithFee Parameters — ✅ PASS

| Parameter | Expected | Actual | Status |
|-----------|----------|--------|--------|
| Default fee rate | 100 bps (1%) | `feeBps = 100` | ✅ |
| Max fee | 500 bps (5%) | `MAX_FEE = 500` | ✅ |
| Minimum burn | 100 tokens | `minBurnAmount = 100` | ✅ |
| Configurable fee wallet | Yes | `setFeeWallet()` (onlyOwner) | ✅ |
| Fee wallet initial | Deployer | Set via constructor `_feeWallet` | ✅ |

**Note:** `minBurnAmount = 100` is in **base units** (not 100e18). For an 18-decimal token, this means 100 wei = essentially zero. If intent was 100 whole tokens, it should be `100e18`. **Flagged for review.**

---

## 4. CONTRACT_SPEC.md — ⚠️ EXISTS (should not)

Found at: `/opt/fundbot/work/workspace-connie/CONTRACT_SPEC.md`

This is a legacy file from old plans. Per task spec, it shouldn't exist. **Recommend deletion.**

---

## 5. WALLETS.md Address Verification — ✅ PASS

| Entity | WALLETS.md Address | Matches Code/Deploys |
|--------|-------------------|---------------------|
| Deployer | `0x9508752Ba171D37EBb3AA437927458E0a21D1e04` | ✅ |
| PulseToken (Sepolia) | `0x21111B39A502335aC7e45c4574Dd083A69258b07` | ✅ |
| PulseRegistry (Sepolia) | `0xe61C615743A02983A46aFF66Db035297e8a43846` | ✅ |
| HeyElsa Wallet | `0xDb48A285a559F61EF3B3AFbc7ef5D7Ce9FAAAcd6` | ✅ (referenced in MEMORY.md) |
| Treasury Safe | `0xA7940a42c30A7F492Ed578F3aC728c2929103E43` | ✅ (in .env files + LINKS.md) |

---

## 6. MEMORY.md Wallet Key Locations — ✅ PASS

| Key | Location in MEMORY.md | Verified |
|-----|----------------------|----------|
| Deployer `0x9508...` | `/opt/fundbot/work/workspace-connie/secrets/wallets/connie.core-mainnet.key.json` | ✅ |
| Backup | `/opt/fundbot/secrets/hotwallet/connie.core-mainnet.key.json` | Listed ✅ |
| Full backup (mnemonic) | `/opt/fundbot/secrets/hotwallet/connie.core-mainnet.full.json` | Listed ✅ |
| HeyElsa | 1Password `Connie-Automation` vault, Vercel `HEYELSA_PAYMENT_KEY` | ✅ |
| Note about same wallet on Sepolia | Present | ✅ |

---

## 7. Deployer Key File Verification — ✅ PASS

`connie.core-mainnet.key.json` address field: `0x9508752Ba171D37EBb3AA437927458E0a21D1e04` — **matches deployer address exactly.**

---

## 8. `.env*` Files in `apps/web/` — ⚠️ ISSUES FOUND

| File | Status | Issues |
|------|--------|--------|
| `.env.testnet` | ✅ OK | All 4 contract addresses correct (PulseToken + PulseRegistry) |
| `.env.mainnet` | ✅ OK | Addresses blank (TBD — correct, mainnet not deployed) |
| `.env.local` | ⚠️ Mixed | Has Vercel-pulled values. `NEXT_PUBLIC_PULSE_TOKEN_ADDRESS` set to testnet address on line 26, but CHAIN_ID is 8453 (mainnet). **Mismatch.** |
| `.env.example` | ⚠️ Stale | Many addresses blank (`NEXT_PUBLIC_PULSE_TOKEN_ADDRESS=""`, etc). Missing PeerAttestation and BurnWithFee addresses entirely. |

**Key issues:**
1. **`.env.local`** mixes mainnet chain ID with testnet contract addresses — confusing but may be intentional for dev
2. **`.env.example`** has no references to PeerAttestation or BurnWithFee contracts
3. **`.env.local`** contains a Vercel OIDC token and KV secrets (should not be committed)
4. **No `.env*` file** references PeerAttestation (`0x4B14...`) or BurnWithFee (`0x326a...`) addresses

---

## 9. Forge Test Results — ✅ PASS (129/129)

| Suite | Passed | Failed | Skipped |
|-------|--------|--------|---------|
| BurnWithFeeTest | 33 | 0 | 0 |
| P0A_FlashLoanTest | 8 | 0 | 0 |
| PeerAttestationTest | 23 | 0 | 0 |
| PulseRegistryV2Test | 65 | 0 | 0 |
| **Total** | **129** | **0** | **0** |

---

## 10. Deployed Address Cross-Reference — ✅ PASS

| Contract | Expected Address | Found In Code | Consistent |
|----------|-----------------|---------------|------------|
| PeerAttestation | `0x930dC6130b20775E01414a5923e7C66b62FF8d6C` | `SEPOLIA_DEPLOY_RECEIPT.md`, `POST_HACKATHON_ROADMAP.md` | ✅ |
| BurnWithFee | `0xd38cC332ca9755DE536841f2A248f4585Fb08C1E` | `SEPOLIA_DEPLOY_RECEIPT.md`, `POST_HACKATHON_ROADMAP.md` | ✅ |
| PulseToken | `0x21111B39A502335aC7e45c4574Dd083A69258b07` | `.env.testnet`, SDK, SKILL.md, LINKS.md, 15+ files | ✅ |
| PulseRegistry | `0xe61C615743A02983A46aFF66Db035297e8a43846` | `.env.testnet`, SDK, SKILL.md, LINKS.md, 20+ files | ✅ |

**Note:** PeerAttestation and BurnWithFee are only referenced in reports/docs, not yet wired into app `.env` or SDK code. This is expected if they're Phase 2.

---

## 11. LINKS.md — ⚠️ PARTIALLY OUTDATED

| Entry | Status |
|-------|--------|
| Treasury Safe | ✅ Correct |
| PulseToken (Sepolia) | ✅ Correct |
| PulseRegistry (Sepolia) | ✅ Correct |
| Deployer | ✅ Correct |
| $PULSE token (mainnet) | Shows "TBD" — correct (not deployed) |
| **PeerAttestation** | ❌ **Missing** |
| **BurnWithFee** | ❌ **Missing** |
| ERC-8004 registries | ✅ Present |

---

## Summary

| Check | Result |
|-------|--------|
| Contract inventory | ✅ 3 contracts + 2 interfaces |
| PeerAttestation events | ✅ All fields correct, indexed properly |
| BurnWithFee params | ✅ (⚠️ minBurnAmount=100 is base units, not 100 tokens) |
| CONTRACT_SPEC.md | ⚠️ Exists — should be deleted |
| WALLETS.md addresses | ✅ All match |
| MEMORY.md key locations | ✅ Accurate |
| Deployer key file | ✅ Address matches |
| .env files | ⚠️ .env.local chain/address mismatch; .env.example stale; no PeerAttestation/BurnWithFee |
| Forge tests | ✅ 129/129 passing |
| Deployed addresses | ✅ All consistent across codebase |
| LINKS.md | ⚠️ Missing PeerAttestation + BurnWithFee entries |

### Action Items

1. **Delete** `/opt/fundbot/work/workspace-connie/CONTRACT_SPEC.md` (legacy artifact)
2. **Add** PeerAttestation + BurnWithFee addresses to `LINKS.md`
3. **Review** `minBurnAmount = 100` in BurnWithFee — likely should be `100e18` for 100 whole tokens
4. **Clean up** `.env.local` — remove leaked Vercel OIDC token and KV secrets
5. **Add** PeerAttestation + BurnWithFee env vars to `.env.example` and `.env.testnet`
6. **Resolve** `.env.local` chain ID (8453) vs testnet contract address mismatch
