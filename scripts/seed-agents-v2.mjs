#!/usr/bin/env node
/**
 * seed-agents-v2.mjs — Sequential nonce-safe distribution.
 * Waits for each tx to confirm before sending next.
 */
import { execSync } from "child_process";
import { randomBytes } from "crypto";
import fs from "fs";

const RPC = process.env.BASE_RPC_URL || "https://mainnet.base.org";
const PULSE = "0x21111B39A502335aC7e45c4574Dd083A69258b07";
const REGISTRY = "0xe61C615743A02983A46aFF66Db035297e8a43846";
const DEPLOYER_KEY = process.env.PRIVATE_KEY;
if (!DEPLOYER_KEY) { console.error("PRIVATE_KEY required"); process.exit(1); }

const COUNT = parseInt(process.argv[2] || "20");

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function run(cmd) {
  try {
    return execSync(cmd, { encoding: "utf8", timeout: 60000 }).trim();
  } catch (e) {
    console.error(`  FAIL: ${e.message?.split("\n")[0]}`);
    return null;
  }
}

async function castSendWait(to, sig, args, key) {
  await sleep(2000); // 2s between sends to avoid nonce collisions
  const cmd = `cast send --rpc-url ${RPC} --private-key ${key} ${to} "${sig}" ${args} --json`;
  const result = run(cmd);
  if (!result) return null;
  try {
    const j = JSON.parse(result);
    return j.status === "0x1" ? j.transactionHash : null;
  } catch {
    return result;
  }
}

async function castSendEthWait(to, value, key) {
  await sleep(2000); // 2s between sends
  const cmd = `cast send --rpc-url ${RPC} --private-key ${key} --value ${value} ${to} --json`;
  const result = run(cmd);
  if (!result) return null;
  try {
    const j = JSON.parse(result);
    return j.status === "0x1" ? j.transactionHash : null;
  } catch {
    return result;
  }
}

function genWallet() {
  const pk = "0x" + randomBytes(32).toString("hex");
  const addr = run(`cast wallet address --private-key ${pk}`);
  return { pk, addr };
}

async function main() {
  console.log(`\n🌱 Seed Agents v2 — ${COUNT} wallets, sequential sends\n`);

  // Load existing wallets if available, or generate new ones
  const keyFile = process.argv[3];
  let wallets;
  
  if (keyFile && fs.existsSync(keyFile)) {
    console.log(`📂 Loading wallets from ${keyFile}`);
    const data = JSON.parse(fs.readFileSync(keyFile, "utf8"));
    wallets = data.map(w => ({ pk: w.privateKey, addr: w.address }));
  } else {
    console.log("📝 Generating wallets...");
    wallets = [];
    for (let i = 0; i < COUNT; i++) {
      const w = genWallet();
      wallets.push(w);
      console.log(`  [${i+1}] ${w.addr}`);
    }
    const ts = Date.now();
    fs.writeFileSync(`scripts/.seed-keys-${ts}.json`, 
      JSON.stringify(wallets.map(w => ({privateKey: w.pk, address: w.addr})), null, 2));
    fs.writeFileSync(`scripts/seed-wallets-${ts}.json`,
      JSON.stringify(wallets.map(w => ({address: w.addr})), null, 2));
    console.log(`💾 Saved to scripts/seed-wallets-${ts}.json`);
  }

  const pulseWei = (BigInt(100000) * 10n**18n).toString();
  const pulseAmountForPulse = (1000n * 10n**18n).toString();

  // Phase 1: Fund with ETH
  console.log("\n⛽ Phase 1: Funding ETH...");
  let funded = 0;
  for (let i = 0; i < wallets.length; i++) {
    const bal = run(`cast balance --rpc-url ${RPC} ${wallets[i].addr}`);
    if (bal && BigInt(bal) > 0n) {
      console.log(`  [${i+1}] ${wallets[i].addr} — already funded`);
      funded++;
      continue;
    }
    const tx = await castSendEthWait(wallets[i].addr, "0.0002ether", DEPLOYER_KEY);
    if (tx) {
      console.log(`  [${i+1}] ✅ ${wallets[i].addr}`);
      funded++;
    } else {
      console.log(`  [${i+1}] ❌ ${wallets[i].addr}`);
    }
  }
  console.log(`  Funded: ${funded}/${wallets.length}`);

  // Phase 2: Send PULSE
  console.log("\n💓 Phase 2: Distributing PULSE...");
  let pulsed_count = 0;
  for (let i = 0; i < wallets.length; i++) {
    const pBal = run(`cast call --rpc-url ${RPC} ${PULSE} "balanceOf(address)(uint256)" ${wallets[i].addr}`);
    const pNum = pBal ? BigInt(pBal.split(" ")[0]) : 0n;
    if (pNum > 0n) {
      console.log(`  [${i+1}] ${wallets[i].addr} — already has PULSE`);
      pulsed_count++;
      continue;
    }
    const tx = await castSendWait(PULSE, "transfer(address,uint256)", `${wallets[i].addr} ${pulseWei}`, DEPLOYER_KEY);
    if (tx) {
      console.log(`  [${i+1}] ✅ ${wallets[i].addr}`);
      pulsed_count++;
    } else {
      console.log(`  [${i+1}] ❌ ${wallets[i].addr}`);
    }
  }
  console.log(`  Distributed: ${pulsed_count}/${wallets.length}`);

  // Phase 3: Each wallet approves + pulses
  console.log("\n🫀 Phase 3: Agents pulsing...");
  let alive = 0;
  for (let i = 0; i < wallets.length; i++) {
    const w = wallets[i];
    // Check if already alive
    const isAlive = run(`cast call --rpc-url ${RPC} ${REGISTRY} "isAlive(address)(bool)" ${w.addr}`);
    if (isAlive === "true") {
      console.log(`  [${i+1}] ${w.addr} — already alive`);
      alive++;
      continue;
    }
    // Check ETH balance
    const ethBal = run(`cast balance --rpc-url ${RPC} ${w.addr}`);
    if (!ethBal || BigInt(ethBal) === 0n) {
      console.log(`  [${i+1}] ❌ ${w.addr} — no ETH, skipping`);
      continue;
    }
    // Approve
    const approveTx = await castSendWait(PULSE, "approve(address,uint256)(bool)", `${REGISTRY} ${pulseWei}`, w.pk);
    if (!approveTx) {
      console.log(`  [${i+1}] ❌ ${w.addr} — approve failed`);
      continue;
    }
    // Pulse
    const pulseTx = await castSendWait(REGISTRY, "pulse(uint256)", pulseAmountForPulse, w.pk);
    if (pulseTx) {
      console.log(`  [${i+1}] ✅ ${w.addr} — ALIVE`);
      alive++;
    } else {
      console.log(`  [${i+1}] ❌ ${w.addr} — pulse failed`);
    }
  }

  console.log(`\n📊 Results: ${alive}/${wallets.length} agents alive`);
  console.log(`\n✅ Check: curl -s https://agent-pulse-nine.vercel.app/api/protocol-health | jq .totalAgents`);
}

await main();
