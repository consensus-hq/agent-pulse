# API Test Receipt — 2026-02-06 03:47 ET

## Test Environment
- Production URL: https://agent-pulse-nine.vercel.app
- Test address: 0x9508752Ba171D37EBb3AA437927458E0a21D1e04

## Free Endpoints

| Endpoint | Method | Status | Latency | Response Snippet |
|----------|--------|--------|---------|-----------------|
| `/api/config` | GET | ✅ 200 | 231ms | `{"description":"Agent Pulse — x402-powered liveness protocol..."}` |
| `/api/protocol-health` | GET | ✅ 200 | 882ms | `{"paused":false,"totalAgents":1,"kvHealthy":true,"rpcHealthy":true,"status":"healthy"}` |
| `/api/status/{addr}` | GET | ✅ 200 | 391ms | `{"address":"0x9508...","isAlive":true,"streak":1,"lastPulse":1770311798,"hazardScore":61}` |
| `/api/abi` | GET | ✅ 200 | 202ms | `{"chainId":"84532","contracts":{"PulseRegistry":{"abi":[...]}}}` |
| `/api/auth/status` | GET | ✅ 200 | 213ms | `{"authenticated":false,"chain":"84532"}` |
| `/api/pulse-feed` | GET | ✅ 200 | 303ms | `{"data":[{"agent":"0x9508...","amount":"1000000000000000000","timestamp":1770311798,"streak":1}]}` |
| `/api/defi` | GET | ✅ 200 | ~500ms | `{"walletAddress":"0xDb48...","totalSpentToday":{"atomic":"70000","usd":0.07},"cacheHitRate":{"hits":4,"misses":7}}` |

## Paid Endpoints

| Endpoint | Method | Status | Notes |
|----------|--------|--------|-------|
| `/api/pulse` | POST | ✅ 402 | Returns empty `{}` body with 402 status. x402 payment required. |

## Summary
- **8/8 endpoints responding correctly**
- Free endpoints: 7/7 return 200 with valid JSON
- Paid endpoint: 1/1 returns 402 (payment required)
- Average latency: ~375ms (excluding protocol-health at 882ms)
- Protocol health: healthy (KV ✅, RPC ✅, not paused)
- Live agent data: 1 agent pulsing, streak 1, alive

## Verdict: ✅ ALL ENDPOINTS OPERATIONAL
