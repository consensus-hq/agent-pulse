/**
 * Deploy All Contracts - Orchestration Script
 * 
 * Deploys:
 * 1. PULSE ERC20 token
 * 2. PulseRegistry (using token from step 1)
 * 
 * Env vars:
 *   DEPLOYER_PRIVATE_KEY - deployer wallet (needs ETH for gas)
 *   RPC_URL - Base RPC (mainnet or Sepolia)
 *   CHAIN_ID - 8453 (mainnet) or 84532 (sepolia)
 * 
 * Usage:
 *   DEPLOYER_PRIVATE_KEY=0x... RPC_URL=https://mainnet.base.org CHAIN_ID=8453 npx tsx scripts/deploy-all.ts
 * 
 * Or with existing token:
 *   PULSE_TOKEN_ADDRESS=0x... DEPLOYER_PRIVATE_KEY=0x... RPC_URL=... npx tsx scripts/deploy-all.ts
 */

import { createWalletClient, createPublicClient, http, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, baseSepolia } from "viem/chains";
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;
const RPC_URL = process.env.RPC_URL;
const CHAIN_ID = parseInt(process.env.CHAIN_ID || "8453", 10);
const EXISTING_TOKEN = process.env.PULSE_TOKEN_ADDRESS;

if (!PRIVATE_KEY) throw new Error("Missing DEPLOYER_PRIVATE_KEY");
if (!RPC_URL) throw new Error("Missing RPC_URL");

const BURN_SINK = "0x000000000000000000000000000000000000dEaD" as const;
const TTL_SECONDS = 86400n; // 24h
const MIN_PULSE = parseEther("1"); // 1 PULSE

async function deployToken(
  walletClient: ReturnType<typeof createWalletClient>,
  publicClient: ReturnType<typeof createPublicClient>
): Promise<`0x${string}`> {
  console.log("\n=== Step 1: Deploying PULSE Token ===");

  const name = "Pulse";
  const symbol = "PULSE";
  const initialSupply = parseEther("1000000"); // 1,000,000 PULSE

  // Load compiled artifact
  const artifactPath = resolve(__dirname, "../packages/contracts/out/PulseToken.sol/PulseToken.json");
  const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));

  console.log("Token Name:", name);
  console.log("Token Symbol:", symbol);
  console.log("Initial Supply:", "1,000,000 PULSE");

  const hash = await walletClient.deployContract({
    abi: artifact.abi,
    bytecode: artifact.bytecode.object as `0x${string}`,
    args: [name, symbol, initialSupply, walletClient.account.address],
  });

  console.log("Deploy tx:", hash);
  console.log("Waiting for confirmation...");

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  
  if (!receipt.contractAddress) {
    throw new Error("Token deployment failed - no contract address");
  }

  console.log("✅ PULSE Token deployed at:", receipt.contractAddress);
  console.log("Block:", receipt.blockNumber.toString());
  console.log("Gas used:", receipt.gasUsed.toString());

  return receipt.contractAddress;
}

async function deployRegistry(
  walletClient: ReturnType<typeof createWalletClient>,
  publicClient: ReturnType<typeof createPublicClient>,
  tokenAddress: `0x${string}`
): Promise<`0x${string}`> {
  console.log("\n=== Step 2: Deploying PulseRegistry ===");

  // Load compiled artifact
  const artifactPath = resolve(__dirname, "../packages/contracts/out/PulseRegistry.sol/PulseRegistry.json");
  const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));

  console.log("PULSE Token:", tokenAddress);
  console.log("Signal Sink:", BURN_SINK);
  console.log("TTL:", TTL_SECONDS.toString(), "seconds (24h)");
  console.log("Min Pulse:", MIN_PULSE.toString(), "wei (1 PULSE)");

  const hash = await walletClient.deployContract({
    abi: artifact.abi,
    bytecode: artifact.bytecode.object as `0x${string}`,
    args: [tokenAddress, BURN_SINK, TTL_SECONDS, MIN_PULSE],
  });

  console.log("Deploy tx:", hash);
  console.log("Waiting for confirmation...");

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  
  if (!receipt.contractAddress) {
    throw new Error("Registry deployment failed - no contract address");
  }

  console.log("✅ PulseRegistry deployed at:", receipt.contractAddress);
  console.log("Block:", receipt.blockNumber.toString());
  console.log("Gas used:", receipt.gasUsed.toString());

  return receipt.contractAddress;
}

async function smokeTest(
  publicClient: ReturnType<typeof createPublicClient>,
  registryAddress: `0x${string}`
): Promise<void> {
  console.log("\n=== Step 3: Smoke Test ===");

  const artifactPath = resolve(__dirname, "../packages/contracts/out/PulseRegistry.sol/PulseRegistry.json");
  const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));

  try {
    const [ttl, minPulse, owner] = await Promise.all([
      publicClient.readContract({
        address: registryAddress,
        abi: artifact.abi,
        functionName: "ttlSeconds",
      }),
      publicClient.readContract({
        address: registryAddress,
        abi: artifact.abi,
        functionName: "minPulseAmount",
      }),
      publicClient.readContract({
        address: registryAddress,
        abi: artifact.abi,
        functionName: "owner",
      }),
    ]);

    console.log("✅ ttlSeconds():", ttl.toString());
    console.log("✅ minPulseAmount():", minPulse.toString());
    console.log("✅ owner():", owner);

    if (ttl !== TTL_SECONDS) {
      throw new Error(`TTL mismatch: expected ${TTL_SECONDS}, got ${ttl}`);
    }
    if (minPulse !== MIN_PULSE) {
      throw new Error(`Min pulse mismatch: expected ${MIN_PULSE}, got ${minPulse}`);
    }

    console.log("✅ Smoke tests passed!");
  } catch (error) {
    console.error("❌ Smoke test failed:", error);
    throw error;
  }
}

async function main() {
  const account = privateKeyToAccount(PRIVATE_KEY as `0x${string}`);
  const chain = CHAIN_ID === 8453 ? base : baseSepolia;

  console.log("=== Agent Pulse Full Deployment ===");
  console.log("Chain:", chain.name, `(${CHAIN_ID})`);
  console.log("Deployer:", account.address);

  const publicClient = createPublicClient({
    chain,
    transport: http(RPC_URL),
  });

  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(RPC_URL),
  });

  const balance = await publicClient.getBalance({ address: account.address });
  console.log("Deployer balance:", balance.toString(), "wei");

  if (balance < parseEther("0.01")) {
    throw new Error("Insufficient ETH for deployment gas (need at least 0.01 ETH)");
  }

  // Deploy token (or use existing)
  let tokenAddress: `0x${string}`;
  if (EXISTING_TOKEN) {
    console.log("\nℹ Using existing PULSE token:", EXISTING_TOKEN);
    tokenAddress = EXISTING_TOKEN as `0x${string}`;
  } else {
    tokenAddress = await deployToken(walletClient, publicClient);
  }

  // Deploy registry
  const registryAddress = await deployRegistry(walletClient, publicClient, tokenAddress);

  // Run smoke tests
  await smokeTest(publicClient, registryAddress);

  // Generate deployment record
  const deployment = {
    chainId: CHAIN_ID,
    chainName: chain.name,
    deployedAt: new Date().toISOString(),
    deployer: account.address,
    pulseToken: {
      address: tokenAddress,
      name: "Pulse",
      symbol: "PULSE",
    },
    pulseRegistry: {
      address: registryAddress,
      signalSink: BURN_SINK,
      ttlSeconds: TTL_SECONDS.toString(),
      minPulseAmount: MIN_PULSE.toString(),
    },
  };

  // Save deployment info
  const deploymentPath = resolve(__dirname, "../DEPLOYMENT.md");
  const deploymentJsonPath = resolve(__dirname, "../DEPLOYMENT.json");
  
  writeFileSync(deploymentJsonPath, JSON.stringify(deployment, null, 2));
  
  const markdownContent = `# Agent Pulse Deployment

**Deployed at:** ${deployment.deployedAt}
**Chain:** ${deployment.chainName} (${deployment.chainId})
**Deployer:** ${deployment.deployer}

## Contract Addresses

### PULSE Token
- **Address:** \`${deployment.pulseToken.address}\`
- **Name:** ${deployment.pulseToken.name}
- **Symbol:** ${deployment.pulseToken.symbol}

### PulseRegistry
- **Address:** \`${deployment.pulseRegistry.address}\`
- **Signal Sink:** \`${deployment.pulseRegistry.signalSink}\`
- **TTL:** ${deployment.pulseRegistry.ttlSeconds} seconds (24h)
- **Min Pulse:** ${deployment.pulseRegistry.minPulseAmount} wei (1 PULSE)

## Vercel Environment Variables

\`\`\`bash
# Set these in Vercel or use scripts/set-vercel-env.sh
export NEXT_PUBLIC_PULSE_TOKEN_ADDRESS="${tokenAddress}"
export PULSE_TOKEN_ADDRESS="${tokenAddress}"
export NEXT_PUBLIC_PULSE_REGISTRY_ADDRESS="${registryAddress}"
\`\`\`

## Verification Commands

\`\`\`bash
# Verify PULSE Token
forge verify-contract ${tokenAddress} PulseToken \\
  --chain ${CHAIN_ID} \\
  --constructor-args $(cast abi-encode "constructor(string,string,uint256,address)" "Pulse" "PULSE" ${parseEther("1000000")} ${account.address})

# Verify PulseRegistry
forge verify-contract ${registryAddress} PulseRegistry \\
  --chain ${CHAIN_ID} \\
  --constructor-args $(cast abi-encode "constructor(address,address,uint256,uint256)" ${tokenAddress} ${BURN_SINK} ${TTL_SECONDS} ${MIN_PULSE})
\`\`\`
`;

  writeFileSync(deploymentPath, markdownContent);

  console.log("\n=== Deployment Complete ===");
  console.log("\nContract Addresses:");
  console.log("  PULSE Token:     ", tokenAddress);
  console.log("  PulseRegistry:   ", registryAddress);
  console.log("\nFiles saved:");
  console.log("  -", deploymentPath);
  console.log("  -", deploymentJsonPath);

  console.log("\n=== Next Steps ===");
  console.log("1. Verify contracts on BaseScan using the commands in DEPLOYMENT.md");
  console.log("2. Set Vercel env vars:");
  console.log(`   PULSE_TOKEN=${tokenAddress} PULSE_REGISTRY=${registryAddress} ./scripts/set-vercel-env.sh`);
  console.log("3. Run the smoke test:");
  console.log("   npm run smoke");
}

main().catch((err) => {
  console.error("\n❌ Deployment failed:", err.message);
  process.exit(1);
});
