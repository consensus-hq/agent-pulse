/**
 * Deploy PulseRegistry to Base Sepolia testnet
 * 
 * Prerequisites:
 * - TESTNET_PRIVATE_KEY env var (deployer with Sepolia ETH)
 * - TESTNET_RPC_URL env var (Base Sepolia RPC)
 * - PULSE token must be deployed first (or use mock)
 * 
 * Usage:
 *   TESTNET_PRIVATE_KEY=0x... TESTNET_RPC_URL=https://sepolia.base.org npx tsx scripts/deploy-testnet.ts
 */

import { createWalletClient, createPublicClient, http, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

const RPC_URL = process.env.TESTNET_RPC_URL || "https://sepolia.base.org";
const PRIVATE_KEY = process.env.TESTNET_PRIVATE_KEY;

if (!PRIVATE_KEY) {
  throw new Error("Missing TESTNET_PRIVATE_KEY");
}

const BURN_SINK = "0x000000000000000000000000000000000000dEaD";
const TTL_SECONDS = 86400n; // 24h
const MIN_PULSE = parseEther("1"); // 1 PULSE

async function main() {
  const account = privateKeyToAccount(PRIVATE_KEY as `0x${string}`);
  
  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(RPC_URL),
  });

  const walletClient = createWalletClient({
    account,
    chain: baseSepolia,
    transport: http(RPC_URL),
  });

  console.log("Deployer:", account.address);
  
  const balance = await publicClient.getBalance({ address: account.address });
  console.log("Balance:", balance.toString(), "wei");
  
  if (balance === 0n) {
    throw new Error("Deployer has no ETH. Get Base Sepolia ETH from faucet.");
  }

  // For testnet, we can deploy a mock PULSE token first
  // Then deploy PulseRegistry with:
  // - pulseToken: mock token address
  // - signalSink: BURN_SINK
  // - ttlSeconds: TTL_SECONDS
  // - minPulseAmount: MIN_PULSE

  console.log("\nTestnet deployment config:");
  console.log("  Chain: Base Sepolia (84532)");
  console.log("  Signal Sink:", BURN_SINK);
  console.log("  TTL:", TTL_SECONDS.toString(), "seconds");
  console.log("  Min Pulse:", MIN_PULSE.toString(), "wei");
  
  console.log("\nNext steps:");
  console.log("1. Deploy MockERC20 (PULSE) on testnet");
  console.log("2. Deploy PulseRegistry with mock token address");
  console.log("3. Verify on BaseScan Sepolia");
  console.log("4. Run integration tests");
  
  // TODO: Add actual deployment when ready
  // const mockTokenHash = await walletClient.deployContract({ ... });
  // const registryHash = await walletClient.deployContract({ ... });
}

main().catch(console.error);
