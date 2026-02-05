# Agent Pulse — Testnet Verification Checklist

**Network:** Base Sepolia (Chain ID: 84532)  
**Generated:** 2026-02-05 17:22 ET  
**Status:** ✅ VERIFIED & WORKING

---

## 1. Contract Deployment

### PulseToken (ERC-20)
| Item | Value | Verified |
|------|-------|----------|
| Address | `0x7f24C286872c9594499CD634c7Cc7735551242a2` | ✅ |
| Deploy Tx | [`0xe141435f998222d2aab46f0b24fcbc1497b28408dc00419da341e699dbc9a7cd`](https://sepolia.basescan.org/tx/0xe141435f998222d2aab46f0b24fcbc1497b28408dc00419da341e699dbc9a7cd) | ✅ |
| Block | 37259998 | ✅ |
| Gas Used | 1,225,180 | ✅ |
| Source Verified | [BaseScan ✅](https://sepolia.basescan.org/address/0x7f24C286872c9594499CD634c7Cc7735551242a2#code) | ✅ |
| Compiler | v0.8.33 | ✅ |

### PulseRegistry (Core Protocol)
| Item | Value | Verified |
|------|-------|----------|
| Address | `0x2C802988c16Fae08bf04656fe93aDFA9a5bA8612` | ✅ |
| Deploy Tx | [`0x86177a3921d728e8261b3db05190a7e8ef78005ccaeb9d9c3b56e709ef3dac56`](https://sepolia.basescan.org/tx/0x86177a3921d728e8261b3db05190a7e8ef78005ccaeb9d9c3b56e709ef3dac56) | ✅ |
| Block | 37260003 | ✅ |
| Gas Used | 1,625,823 | ✅ |
| Source Verified | [BaseScan ✅](https://sepolia.basescan.org/address/0x2C802988c16Fae08bf04656fe93aDFA9a5bA8612#code) | ✅ |
| Compiler | v0.8.33 | ✅ |

---

## 2. Protocol Transactions (On-Chain Proof)

### Pulse Events (Live Activity)
| Tx Hash | Agent | Amount | Streak | Block | Time |
|---------|-------|--------|--------|-------|------|
| [`0xf152a2f6...881f40c4`](https://sepolia.basescan.org/tx/0xf152a2f633d7906973d77f2e1f37b1a0f4904d528884f845760004ca881f40c4) | `0x9508...1e04` | 1 PULSE | 1 | 37271755 | 2026-02-05 17:16 |
| [`0x1b07095e...a28cb80`](https://sepolia.basescan.org/tx/0x1b07095eb69d8257d1c75043ebfc063a7af96a2a6eb5a6749908ebaeaa28cb80) | `0x9508...1e04` | 1 PULSE | 1 | 37260028 | 2026-02-05 10:45 |

---

## 3. Contract Functions (Verified Working)

| Function | Status | Test Evidence |
|----------|--------|---------------|
| `pulse(uint256)` | ✅ Working | Tx `0xf152a2f6...` succeeded |
| `isAlive(address)` | ✅ Working | Returns `true` for active agent |
| `agents(address)` | ✅ Working | Returns struct with streak, timestamp |
| `ttlSeconds()` | ✅ Working | Returns 86400 (24h) |
| `minPulseAmount()` | ✅ Working | Returns 1e18 (1 PULSE) |
| `signalSink()` | ✅ Working | Returns `0x...dEaD` (burn) |
| `pause()`/`unpause()` | ✅ Working | Owner-only, tested in fork |
| `setHazardScore()` | ✅ Working | Owner-only, tested in fork |

---

## 4. API Endpoints (Live Production)

**Base URL:** https://agent-pulse-nine.vercel.app

| Endpoint | Status | Response |
|----------|--------|----------|
| `GET /api/status/{address}` | ✅ 200 | Returns isAlive, streak, hazardScore |
| `GET /api/pulse-feed` | ✅ 200 | Returns paginated events with tx hashes |
| `GET /api/protocol-health` | ✅ 200 | Returns KV + RPC status |
| `GET /api/docs` | ✅ 200 | OpenAPI 3.1.0 spec |

### Sample API Response
```json
// GET /api/status/0x9508752Ba171D37EBb3AA437927458E0a21D1e04
{
  "address": "0x9508752ba171d37ebb3aa437927458e0a21d1e04",
  "isAlive": true,
  "streak": 1,
  "lastPulse": 1770311798,
  "hazardScore": 17,
  "ttlSeconds": 86400
}
```

---

## 5. Test Suite Results

| Category | Pass | Total | Rate |
|----------|------|-------|------|
| Foundry (contracts) | 73 | 73 | 100% |
| Vitest (API/utils) | 56 | 56 | 100% |
| Playwright (E2E) | 8 | 8 | 100% |
| **TOTAL** | **137** | **137** | **100%** |

---

## 6. Frontend Verification

| Feature | Status | Evidence |
|---------|--------|----------|
| WalletConnect | ✅ Working | "Authenticate" button functional |
| Status Query | ✅ Working | Returns live on-chain data |
| Pulse Feed | ✅ Working | Shows real tx hashes |
| Network Badge | ✅ Working | Shows "Base Sepolia 84532" |

**Live URL:** https://agent-pulse-nine.vercel.app

---

## 7. Key Addresses

| Role | Address |
|------|---------|
| Deployer | `0x9508752Ba171D37EBb3AA437927458E0a21D1e04` |
| Treasury Safe | `0xA7940a42c30A7F492Ed578F3aC728c2929103E43` |
| Signal Sink (burn) | `0x000000000000000000000000000000000000dEaD` |
| PulseToken | `0x7f24C286872c9594499CD634c7Cc7735551242a2` |
| PulseRegistry | `0x2C802988c16Fae08bf04656fe93aDFA9a5bA8612` |

---

## 8. Verification Links (Click to Verify)

- [PulseToken on BaseScan](https://sepolia.basescan.org/address/0x7f24C286872c9594499CD634c7Cc7735551242a2#code)
- [PulseRegistry on BaseScan](https://sepolia.basescan.org/address/0x2C802988c16Fae08bf04656fe93aDFA9a5bA8612#code)
- [Deploy Tx #1 (Token)](https://sepolia.basescan.org/tx/0xe141435f998222d2aab46f0b24fcbc1497b28408dc00419da341e699dbc9a7cd)
- [Deploy Tx #2 (Registry)](https://sepolia.basescan.org/tx/0x86177a3921d728e8261b3db05190a7e8ef78005ccaeb9d9c3b56e709ef3dac56)
- [Pulse Tx #1](https://sepolia.basescan.org/tx/0xf152a2f633d7906973d77f2e1f37b1a0f4904d528884f845760004ca881f40c4)
- [Pulse Tx #2](https://sepolia.basescan.org/tx/0x1b07095eb69d8257d1c75043ebfc063a7af96a2a6eb5a6749908ebaeaa28cb80)
- [Live Demo](https://agent-pulse-nine.vercel.app)

---

## ✅ VERDICT: TESTNET FULLY OPERATIONAL

All contracts deployed, verified, and functioning. Protocol has processed real pulse transactions. APIs return live on-chain data. Ready for hackathon submission on testnet.
