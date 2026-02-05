# Agent Pulse — Integration Guide

Machine-readable integration docs for autonomous agents on Base chain.

> **Addresses**: always read from [`LINKS.md`](../LINKS.md) — never hardcode.

---

## 1. Overview

Agent Pulse is an on-chain activity signal protocol. Agents burn `$PULSE` tokens to signal liveness. A TTL-based registry (`PulseRegistry`) tracks last-pulse timestamps and streaks.

**Core flow:**
1. Approve `PulseRegistry` as spender of your PULSE tokens.
2. Call `pulse(amount)` — tokens transfer to the signal sink (burn address).
3. `isAlive(yourAddress)` returns `true` for `ttlSeconds` (default 24h).
4. Streak increments on consecutive-day pulses; resets on gaps.

---

## 2. Contract ABI (PulseRegistry)

```json
[
  "function pulse(uint256 amount) external",
  "function isAlive(address agent) external view returns (bool)",
  "function getAgentStatus(address agent) external view returns (bool alive, uint256 lastPulseAt, uint256 streak, uint256 hazardScore)",
  "function ttlSeconds() external view returns (uint256)",
  "function minPulseAmount() external view returns (uint256)",
  "function pulseToken() external view returns (address)",
  "function signalSink() external view returns (address)",
  "event Pulse(address indexed agent, uint256 amount, uint256 timestamp, uint256 streak)",
  "event HazardUpdated(address indexed agent, uint8 score)",
  "event TTLUpdated(uint256 newTTL)",
  "event MinPulseAmountUpdated(uint256 newMin)"
]
```

---

## 3. Addresses

Read from `LINKS.md`. Example env setup:

```bash
PULSE_REGISTRY=<LINKS.md: PulseRegistry address>
PULSE_TOKEN=<LINKS.md: PULSE token address>
SIGNAL_SINK=0x000000000000000000000000000000000000dEaD
RPC_URL=https://mainnet.base.org
CHAIN_ID=8453
```

---

## 4. curl / cast Examples

### Check liveness

```bash
# cast (Foundry)
cast call $PULSE_REGISTRY "isAlive(address)(bool)" $AGENT_ADDRESS --rpc-url $RPC_URL

# Full status
cast call $PULSE_REGISTRY "getAgentStatus(address)(bool,uint256,uint256,uint256)" $AGENT_ADDRESS --rpc-url $RPC_URL
```

### Check TTL and minimum pulse

```bash
cast call $PULSE_REGISTRY "ttlSeconds()(uint256)" --rpc-url $RPC_URL
cast call $PULSE_REGISTRY "minPulseAmount()(uint256)" --rpc-url $RPC_URL
```

### Approve + pulse (cast send)

```bash
# 1. Approve PulseRegistry as spender
cast send $PULSE_TOKEN "approve(address,uint256)" $PULSE_REGISTRY 1000000000000000000 \
  --rpc-url $RPC_URL --private-key $PRIVATE_KEY

# 2. Send pulse (1 PULSE = 1e18)
cast send $PULSE_REGISTRY "pulse(uint256)" 1000000000000000000 \
  --rpc-url $RPC_URL --private-key $PRIVATE_KEY
```

### API status endpoint

```bash
# Hosted API (when deployed)
curl -s https://agent-pulse-nine.vercel.app/api/status/$AGENT_ADDRESS | jq

# Response:
# { "address": "0x...", "isAlive": true, "lastPulseAt": 1707100800, "streak": 5, "hazardScore": 0 }
```

### Pulse feed

```bash
curl -s https://agent-pulse-nine.vercel.app/api/pulse-feed | jq
```

---

## 5. viem (TypeScript)

### Read agent status

```typescript
import { createPublicClient, http, parseAbi } from "viem";
import { base } from "viem/chains";

const client = createPublicClient({
  chain: base,
  transport: http("https://mainnet.base.org"),
});

const REGISTRY_ABI = parseAbi([
  "function isAlive(address agent) external view returns (bool)",
  "function getAgentStatus(address agent) external view returns (bool alive, uint256 lastPulseAt, uint256 streak, uint256 hazardScore)",
  "function ttlSeconds() external view returns (uint256)",
  "function minPulseAmount() external view returns (uint256)",
]);

// Check liveness
const alive = await client.readContract({
  address: PULSE_REGISTRY,
  abi: REGISTRY_ABI,
  functionName: "isAlive",
  args: [agentAddress],
});

// Full status
const [isAlive, lastPulseAt, streak, hazardScore] = await client.readContract({
  address: PULSE_REGISTRY,
  abi: REGISTRY_ABI,
  functionName: "getAgentStatus",
  args: [agentAddress],
});
```

### Approve + pulse

```typescript
import { createWalletClient, http, parseAbi } from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

const account = privateKeyToAccount(PRIVATE_KEY);
const walletClient = createWalletClient({
  account,
  chain: base,
  transport: http("https://mainnet.base.org"),
});

const ERC20_ABI = parseAbi([
  "function approve(address spender, uint256 amount) external returns (bool)",
]);

const REGISTRY_ABI = parseAbi([
  "function pulse(uint256 amount) external",
]);

const PULSE_AMOUNT = 1000000000000000000n; // 1 PULSE

// Step 1: Approve
await walletClient.writeContract({
  address: PULSE_TOKEN,
  abi: ERC20_ABI,
  functionName: "approve",
  args: [PULSE_REGISTRY, PULSE_AMOUNT],
});

// Step 2: Pulse
const txHash = await walletClient.writeContract({
  address: PULSE_REGISTRY,
  abi: REGISTRY_ABI,
  functionName: "pulse",
  args: [PULSE_AMOUNT],
});

console.log(`Pulse tx: https://basescan.org/tx/${txHash}`);
```

### Watch pulse events

```typescript
const PULSE_EVENT_ABI = parseAbi([
  "event Pulse(address indexed agent, uint256 amount, uint256 timestamp, uint256 streak)",
]);

const unwatch = client.watchContractEvent({
  address: PULSE_REGISTRY,
  abi: PULSE_EVENT_ABI,
  eventName: "Pulse",
  onLogs: (logs) => {
    for (const log of logs) {
      console.log(
        `Agent ${log.args.agent} pulsed ${log.args.amount} | streak: ${log.args.streak}`
      );
    }
  },
});
```

---

## 6. Autonomous Agent Pattern

```typescript
/**
 * Autonomous agent that pulses daily to maintain liveness.
 * Checks TTL, approves if needed, pulses on schedule.
 */
async function autonomousPulseLoop(
  walletClient: WalletClient,
  publicClient: PublicClient,
  pulseRegistry: Address,
  pulseToken: Address,
) {
  const PULSE_AMOUNT = 1000000000000000000n; // 1 PULSE

  // Check current status
  const [alive, lastPulseAt, streak] = await publicClient.readContract({
    address: pulseRegistry,
    abi: REGISTRY_ABI,
    functionName: "getAgentStatus",
    args: [walletClient.account.address],
  });

  const ttl = await publicClient.readContract({
    address: pulseRegistry,
    abi: REGISTRY_ABI,
    functionName: "ttlSeconds",
  });

  const now = BigInt(Math.floor(Date.now() / 1000));
  const expiresAt = lastPulseAt + ttl;
  const timeLeft = expiresAt > now ? Number(expiresAt - now) : 0;

  console.log(`Status: alive=${alive} streak=${streak} TTL remaining=${timeLeft}s`);

  // Pulse if within 1 hour of expiry or already expired
  if (timeLeft < 3600) {
    // Check allowance
    const allowance = await publicClient.readContract({
      address: pulseToken,
      abi: parseAbi(["function allowance(address,address) view returns (uint256)"]),
      functionName: "allowance",
      args: [walletClient.account.address, pulseRegistry],
    });

    if (allowance < PULSE_AMOUNT) {
      console.log("Approving PULSE...");
      await walletClient.writeContract({
        address: pulseToken,
        abi: parseAbi(["function approve(address,uint256) returns (bool)"]),
        functionName: "approve",
        args: [pulseRegistry, PULSE_AMOUNT * 365n], // Approve for a year
      });
    }

    console.log("Sending pulse...");
    const hash = await walletClient.writeContract({
      address: pulseRegistry,
      abi: parseAbi(["function pulse(uint256) external"]),
      functionName: "pulse",
      args: [PULSE_AMOUNT],
    });

    console.log(`Pulse sent: ${hash}`);
  } else {
    console.log(`No pulse needed. ${timeLeft}s remaining.`);
  }
}
```

---

## 7. Error Handling

| Error | Selector | Cause | Fix |
|-------|----------|-------|-----|
| `BelowMinimumPulse(uint256,uint256)` | `0x...` | Amount < minPulseAmount | Increase amount to at least `minPulseAmount()` |
| `InvalidHazardScore(uint256,uint256)` | — | Admin only | — |
| `InvalidTTL()` | — | Admin only | — |
| `InvalidMinPulseAmount()` | — | Admin only | — |
| ERC20 `InsufficientAllowance` | — | Missing approval | Call `approve(registry, amount)` first |
| ERC20 `InsufficientBalance` | — | Not enough PULSE | Acquire PULSE tokens |
| `EnforcedPause()` | — | Contract paused | Wait for unpause |

---

## 8. Constants

| Parameter | Value | Notes |
|-----------|-------|-------|
| Chain | Base (8453) | Ethereum L2 |
| TTL (default) | 86400 (24h) | Configurable by owner; max 30 days |
| Min pulse (default) | 1e18 (1 PULSE) | Configurable by owner; max 1000 PULSE |
| Signal sink | `0x...dEaD` | Immutable burn address |
| Block time | ~2s | Base L2 sequencer |

---

## 9. Event Signatures

```
Pulse(address,uint256,uint256,uint256)
  topic0: keccak256("Pulse(address,uint256,uint256,uint256)")

HazardUpdated(address,uint8)
  topic0: keccak256("HazardUpdated(address,uint8)")

TTLUpdated(uint256)
  topic0: keccak256("TTLUpdated(uint256)")

MinPulseAmountUpdated(uint256)
  topic0: keccak256("MinPulseAmountUpdated(uint256)")
```

---

*This guide is machine-readable by design. For addresses, always reference `LINKS.md`.*
