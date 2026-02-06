# Audit Context — Agent Pulse vs GTM Playbook

## What Was Just Deployed (2026-02-06 ~14:55 EST)

### Clanker Token
- **Address:** `0x21111B39A502335aC7e45c4574Dd083A69258b07`
- **Supply:** 100,000,000,000 (100B) with 18 decimals — Clanker V4 fixed supply
- **Pool:** Uniswap V4 auto-created, paired with WETH
- **DevBuy:** 0.002 ETH (~20T PULSE to deployer)
- **Rewards:** 100% LP fees → Treasury Safe

### Protocol Contracts (all verified on BaseScan)
- **PulseRegistryV2:** `0xe61C615743A02983A46aFF66Db035297e8a43846`
  - Constructor: `(PULSE_TOKEN, 86400, 1e18)` — 24h TTL, 1 PULSE minimum
  - **Note:** minPulseAmount = 1e18 = 1 PULSE. With 100B supply, this is trivial.
- **PeerAttestation:** `0x930dC6130b20775E01414a5923e7C66b62FF8d6C`
- **BurnWithFee:** `0xd38cC332ca9755DE536841f2A248f4585Fb08C1E`
  - Fee wallet: Treasury Safe `0xA7940a42c30A7F492Ed578F3aC728c2929103E43`

### First Pulse
- TX: `0xda2da67011480ae05734576bf8483f0e00b26d190209849b6a4376da2dee5850`
- 1 PULSE burned to dead address, deployer is now alive

## GTM Playbook Summary (Source of Truth)

### Free Tier
- `isAlive(address)` + `lastPulseTimestamp` — FREE, no auth
- This is the viral wedge. Must be frictionless.

### Paid Tier (PRI — Pulse Reliability Index)
- `reliabilityScore` (0-100)
- `mtbd` (Mean Time Between Drops)
- `peerRank` ("Top 5% of Copywriter Agents")
- `uptimeHistory` (visual heatmaps)
- Via x402 micropayments

### What to Audit
1. Do contracts work correctly with the 100B supply Clanker token?
2. Do all API endpoints match the GTM playbook?
3. Are the PRI endpoints (in `_disabled/`) ready to enable?
4. Is the x402 gate wired to the correct pricing?
5. Does the production app (Vercel) point at the right chain/contracts?
6. Are env vars correct for mainnet?
7. Does the HeyElsa integration work (for the $1k bonus)?

### Judging Criteria
- Usability /25
- Technicality /25
- UI/UX /25
- Token Volume /25

### Clanker Token Page
- Live at: https://clanker.world/clanker/0x21111B39A502335aC7e45c4574Dd083A69258b07
- Market cap range: $27K to $1.5B+
- Buy/Sell fee: 1.00% each + 0.2% Clanker fee
- Sniper protection: 80.01% → 5.00% over 15 seconds

### Submission Can Be Updated
- Per registration.md: "You can update your submission anytime before the deadline"
- We can submit now and update later if needed

### Judging Criteria (CORRECTED from registration.md)
- Usability /25
- **Technicality /25** (not "Vibes")
- UI/UX /25
- Token Volume /25

### Known Issues
- Production Vercel env vars still point to Sepolia (CHAIN_ID=84532)
- PRI endpoints sitting in `_disabled/` folder, not routed
- x402 gate (paid/x402.ts) has HeyElsa-resale pricing, not PRI pricing
- pricing.ts exists with correct PRI pricing but isn't wired to x402 gate
- protocol-health and status endpoints return 500 (thirdweb SDK edge runtime issue)
