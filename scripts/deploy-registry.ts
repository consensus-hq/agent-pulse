/**
 * Deploy PulseRegistry to Base (testnet or mainnet)
 * 
 * Env vars:
 *   DEPLOYER_PRIVATE_KEY - deployer wallet (needs ETH for gas)
 *   RPC_URL - Base RPC (mainnet or Sepolia)
 *   PULSE_TOKEN_ADDRESS - deployed PULSE token address
 *   CHAIN_ID - 8453 (mainnet) or 84532 (sepolia)
 * 
 * Usage:
 *   DEPLOYER_PRIVATE_KEY=0x... PULSE_TOKEN_ADDRESS=0x... RPC_URL=https://mainnet.base.org CHAIN_ID=8453 npx tsx scripts/deploy-registry.ts
 */

import { createWalletClient, createPublicClient, http, parseEther, encodeDeployData } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, baseSepolia } from "viem/chains";
import { readFileSync } from "fs";
import { resolve } from "path";

const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;
const RPC_URL = process.env.RPC_URL;
const PULSE_TOKEN = process.env.PULSE_TOKEN_ADDRESS;
const CHAIN_ID = parseInt(process.env.CHAIN_ID || "8453", 10);

if (!PRIVATE_KEY) throw new Error("Missing DEPLOYER_PRIVATE_KEY");
if (!RPC_URL) throw new Error("Missing RPC_URL");
if (!PULSE_TOKEN) throw new Error("Missing PULSE_TOKEN_ADDRESS");

const BURN_SINK = "0x000000000000000000000000000000000000dEaD" as const;
const TTL_SECONDS = 86400n; // 24h
const MIN_PULSE = parseEther("1"); // 1 PULSE

// Load compiled artifact
const artifactPath = resolve(__dirname, "../packages/contracts/out/PulseRegistry.sol/PulseRegistry.json");
const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));

async function main() {
  const account = privateKeyToAccount(PRIVATE_KEY as `0x${string}`);
  const chain = CHAIN_ID === 8453 ? base : baseSepolia;

  const publicClient = createPublicClient({
    chain,
    transport: http(RPC_URL),
  });

  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(RPC_URL),
  });

  console.log("=== PulseRegistry Deployment ===");
  console.log("Chain:", chain.name, `(${CHAIN_ID})`);
  console.log("Deployer:", account.address);
  console.log("PULSE Token:", PULSE_TOKEN);
  console.log("Signal Sink:", BURN_SINK);
  console.log("TTL:", TTL_SECONDS.toString(), "seconds");
  console.log("Min Pulse:", MIN_PULSE.toString(), "wei (1 PULSE)");

  const balance = await publicClient.getBalance({ address: account.address });
  console.log("Deployer balance:", balance.toString(), "wei");

  if (balance < parseEther("0.001")) {
    throw new Error("Insufficient ETH for deployment gas");
  }

  // Constructor args: (address _pulseToken, address _signalSink, uint256 _ttlSeconds, uint256 _minPulseAmount)
  const hash = await walletClient.deployContract({
    abi: artifact.abi,
    bytecode: artifact.bytecode.object as `0x${string}`,
    args: [PULSE_TOKEN as `0x${string}`, BURN_SINK, TTL_SECONDS, MIN_PULSE],
  });

  console.log("\nDeploy tx:", hash);
  console.log("Waiting for confirmation...");

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  
  if (!receipt.contractAddress) {
    throw new Error("Deployment failed - no contract address");
  }

  console.log("\n✅ PulseRegistry deployed!");
  console.log("Address:", receipt.contractAddress);
  console.log("Block:", receipt.blockNumber);
  console.log("Gas used:", receipt.gasUsed.toString());

  console.log("\n=== Next Steps ===");
  console.log("1. Update LINKS.md with registry address");
  console.log("2. Verify on BaseScan:");
  console.log(`   forge verify-contract ${receipt.contractAddress} PulseRegistry --chain ${CHAIN_ID} --constructor-args $(cast abi-encode "constructor(address,address,uint256,uint256)" ${PULSE_TOKEN} ${BURN_SINK} ${TTL_SECONDS} ${MIN_PULSE})`);
  console.log("3. Set Vercel env NEXT_PUBLIC_PULSE_REGISTRY_ADDRESS");
}

main().catch((err) => {
  console.error("Deployment failed:", err.message);
  process.exit(1);
});
