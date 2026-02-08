/**
 * basic-alive-check.ts
 *
 * The simplest possible Agent Pulse integration.
 * Checks whether a single agent is alive on-chain — no wallet, no API key, no config.
 *
 * Usage:
 *   npx tsx examples/basic-alive-check.ts
 *   npx tsx examples/basic-alive-check.ts 0xYourAgentAddress
 */

import { AgentPulse } from "../src/index.js";

// ── Config ──────────────────────────────────────────────────────────
// Default: a known active agent on Base mainnet
const AGENT_ADDRESS = (process.argv[2] ??
  "0x9508752Ba171D37EBb3AA437927458E0a21D1e04") as `0x${string}`;

// ── Main ────────────────────────────────────────────────────────────
async function main() {
  console.log("🔍 Agent Pulse — Basic Alive Check\n");

  // 1. Create a client (no wallet needed for reads)
  const pulse = new AgentPulse();

  // 2. Binary alive check (one on-chain read)
  console.log(`Checking: ${AGENT_ADDRESS}`);
  const alive = await pulse.isAlive(AGENT_ADDRESS);
  console.log(`Result:   ${alive ? "💓 ALIVE" : "💀 DEAD"}\n`);

  // 3. Full status (streak, hazard score, TTL)
  const status = await pulse.getStatus(AGENT_ADDRESS);
  console.log("Full status:");
  console.log(`  alive:       ${status.alive}`);
  console.log(`  streak:      ${status.streak} consecutive periods`);
  console.log(`  hazardScore: ${status.hazardScore}/100`);
  console.log(`  lastPulse:   ${new Date(status.lastPulse * 1000).toISOString()}`);
  console.log(`  ttlSeconds:  ${status.ttlSeconds}s (${(status.ttlSeconds / 3600).toFixed(1)}h)\n`);

  // 4. PULSE token balance
  const balance = await pulse.getBalance(AGENT_ADDRESS);
  const balanceFormatted = Number(balance) / 1e18;
  console.log(`PULSE balance: ${balanceFormatted.toLocaleString()} PULSE`);
}

main().catch((err) => {
  console.error("Error:", err.message ?? err);
  process.exit(1);
});
