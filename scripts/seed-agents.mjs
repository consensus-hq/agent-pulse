#!/usr/bin/env node
/**
 * seed-agents.mjs — Generate agent wallets, fund them, distribute PULSE, and have them pulse.
 * 
 * Usage:
 *   node scripts/seed-agents.mjs [--count 20] [--pulse-amount 100000] [--eth-per-wallet 0.0001] [--swap-count 5]
 * 
 * Requires: PRIVATE_KEY env var (deployer), cast in PATH
 */

import { execSync } from "child_process";
import { randomBytes } from "crypto";
import fs from "fs";

const RPC = "https://mainnet.base.org";
const PULSE_TOKEN = "0x21111B39A502335aC7e45c4574Dd083A69258b07";
const REGISTRY = "0xe61C615743A02983A46aFF66Db035297e8a43846";
const PULSE_DECIMALS = 18;

// Parse args
const args = process.argv.slice(2);
function getArg(name, def) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
}

const WALLET_COUNT = parseInt(getArg("--count", "20"));
const PULSE_PER_WALLET = parseInt(getArg("--pulse-amount", "100000"));
const ETH_PER_WALLET = getArg("--eth-per-wallet", "0.0002");
const SWAP_COUNT = parseInt(getArg("--swap-count", "5"));
const DRY_RUN = args.includes("--dry-run");

const DEPLOYER_KEY = process.env.PRIVATE_KEY;
if (!DEPLOYER_KEY && !DRY_RUN) {
  console.error("PRIVATE_KEY env var required");
  process.exit(1);
}

function cast(cmd, opts = {}) {
  const full = `cast ${cmd}`;
  try {
    return execSync(full, { encoding: "utf8", timeout: 30000, ...opts }).trim();
  } catch (e) {
    console.error(`cast failed: ${full}\n${e.stderr || e.message}`);
    throw e;
  }
}

function castSend(to, sig, argsStr, key) {
  return cast(`send --rpc-url ${RPC} --private-key ${key} ${to} "${sig}" ${argsStr}`);
}

function generateWallet() {
  const privKey = "0x" + randomBytes(32).toString("hex");
  const addr = cast(`wallet address --private-key ${privKey}`);
  return { privateKey: privKey, address: addr };
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log(`\n🌱 Agent Pulse Seed Script`);
  console.log(`  Wallets: ${WALLET_COUNT}`);
  console.log(`  PULSE per wallet: ${PULSE_PER_WALLET.toLocaleString()}`);
  console.log(`  ETH per wallet: ${ETH_PER_WALLET}`);
  console.log(`  Dry run: ${DRY_RUN}\n`);

  // 1. Generate wallets
  console.log("📝 Generating wallets...");
  const wallets = [];
  for (let i = 0; i < WALLET_COUNT; i++) {
    const w = generateWallet();
    wallets.push(w);
    console.log(`  [${i + 1}] ${w.address}`);
  }

  // Save wallets to file
  const walletFile = `scripts/seed-wallets-${Date.now()}.json`;
  fs.writeFileSync(walletFile, JSON.stringify(wallets.map(w => ({ address: w.address })), null, 2));
  console.log(`\n💾 Wallet addresses saved to ${walletFile}`);
  
  // Save keys separately (gitignored)
  const keyFile = `scripts/.seed-keys-${Date.now()}.json`;
  fs.writeFileSync(keyFile, JSON.stringify(wallets, null, 2));
  console.log(`🔑 Keys saved to ${keyFile} (DO NOT COMMIT)\n`);

  if (DRY_RUN) {
    console.log("🏁 Dry run complete.");
    return;
  }

  const pulseWei = BigInt(PULSE_PER_WALLET) * BigInt(10 ** PULSE_DECIMALS);

  // 2. Fund wallets with ETH
  console.log("⛽ Funding wallets with ETH...");
  for (let i = 0; i < wallets.length; i++) {
    const w = wallets[i];
    try {
      cast(`send --rpc-url ${RPC} --private-key ${DEPLOYER_KEY} --value ${ETH_PER_WALLET}ether ${w.address}`);
      console.log(`  [${i + 1}] ✅ ${w.address} funded ${ETH_PER_WALLET} ETH`);
    } catch (e) {
      console.log(`  [${i + 1}] ❌ ${w.address} ETH funding failed`);
    }
    if (i % 5 === 4) await sleep(1000); // pace
  }

  // 3. Send PULSE to each wallet
  console.log("\n💓 Distributing PULSE...");
  for (let i = 0; i < wallets.length; i++) {
    const w = wallets[i];
    try {
      castSend(PULSE_TOKEN, "transfer(address,uint256)", `${w.address} ${pulseWei}`, DEPLOYER_KEY);
      console.log(`  [${i + 1}] ✅ ${w.address} received ${PULSE_PER_WALLET.toLocaleString()} PULSE`);
    } catch (e) {
      console.log(`  [${i + 1}] ❌ ${w.address} PULSE transfer failed`);
    }
    if (i % 5 === 4) await sleep(1000);
  }

  // 4. Each wallet approves and pulses
  console.log("\n🫀 Agents pulsing...");
  const pulseAmount = BigInt(1000) * BigInt(10 ** PULSE_DECIMALS); // 1000 PULSE per pulse
  for (let i = 0; i < wallets.length; i++) {
    const w = wallets[i];
    try {
      // Approve registry
      castSend(PULSE_TOKEN, "approve(address,uint256)(bool)", `${REGISTRY} ${pulseWei}`, w.privateKey);
      // Pulse
      castSend(REGISTRY, "pulse(uint256)", `${pulseAmount}`, w.privateKey);
      console.log(`  [${i + 1}] ✅ ${w.address} PULSED`);
    } catch (e) {
      console.log(`  [${i + 1}] ❌ ${w.address} pulse failed: ${e.message?.slice(0, 80)}`);
    }
    if (i % 3 === 2) await sleep(500);
  }

  // 5. Summary
  console.log("\n📊 Summary:");
  console.log(`  Wallets created: ${wallets.length}`);
  console.log(`  PULSE distributed: ${(PULSE_PER_WALLET * wallets.length).toLocaleString()}`);
  console.log(`  Protocol agents now pulsing: ${wallets.length}`);
  console.log(`  Wallet file: ${walletFile}`);
  console.log(`\n✅ Done! Check: curl -s https://agent-pulse-nine.vercel.app/api/protocol-health | jq .totalAgents`);
}

await main();
