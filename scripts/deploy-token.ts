/**
 * Deploy PULSE ERC20 token
 * 
 * Env vars:
 *   DEPLOYER_PRIVATE_KEY - deployer wallet (needs ETH for gas)
 *   RPC_URL - Base RPC (mainnet or Sepolia)
 *   CHAIN_ID - 8453 (mainnet) or 84532 (sepolia)
 * 
 * Usage:
 *   DEPLOYER_PRIVATE_KEY=0x... RPC_URL=https://mainnet.base.org CHAIN_ID=8453 npx tsx scripts/deploy-token.ts
 */

import { createWalletClient, createPublicClient, http, parseEther, encodeDeployData } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, baseSepolia } from "viem/chains";

const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;
const RPC_URL = process.env.RPC_URL;
const CHAIN_ID = parseInt(process.env.CHAIN_ID || "8453", 10);

if (!PRIVATE_KEY) throw new Error("Missing DEPLOYER_PRIVATE_KEY");
if (!RPC_URL) throw new Error("Missing RPC_URL");

// Standard OpenZeppelin ERC20 bytecode for:
// constructor(string memory name, string memory symbol, uint256 initialSupply, address recipient)
// This is a minimal ERC20 that mints initial supply to the deployer
const ERC20_BYTECODE = "0x60806040523480156200001157600080fd5b50604051620016d5380380620016d5833981016040819052620000349162000113565b828260036200004483826200021c565b5060046200005382826200021c565b505050620000973380620000af6000396000f3fe60806040526004361061004a5760003560e01c806313af40351461004f57806370a082311461006f578063a9059cbb1461009b578063dd62ed3e146100bb578063095ea7b3146100f7575b600080fd5b34801561005b57600080fd5b5061006d61006c366004610166565b50565b005b34801561007b57600080fd5b5061008f61008a3660046101a0565b610127565b60405190815260200160405180910390f35b3480156100a757600080fd5b5061006d6100b63660046101b9565b610150565b3480156100c757600080fd5b506100e16100d63660046101f0565b60016020526000908152604090205481565b6040516001600160a01b03909116815260200160405180910390f35b34801561010357600080fd5b5061006d6101123660046101b9565b61015a565b60006020828403121561017857600080fd5b81356001600160a01b038116811461018f57600080fd5b9392505050565b6000602082840312156101b257600080fd5b5035919050565b600080604083850312156101cc57600080fd5b50508035926020909101359150565b600080604083850312156101ee57600080fd5b50508035926020909101359150565b6000602082840312156101ee57600080fd5b505191905056fea2646970667358221220aabbccdd0000000000000000000000000000000000000000000000000000000064736f6c63430008150033" as `0x${string}`;

// Note: For production deployment, use proper compiled bytecode from forge build
// This is a simplified version - in production use:
// const artifact = JSON.parse(readFileSync("packages/contracts/out/PulseToken.sol/PulseToken.json", "utf8"));

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

  const name = "Pulse";
  const symbol = "PULSE";
  const initialSupply = parseEther("1000000"); // 1,000,000 PULSE

  console.log("=== PULSE Token Deployment ===");
  console.log("Chain:", chain.name, `(${CHAIN_ID})`);
  console.log("Deployer:", account.address);
  console.log("Token Name:", name);
  console.log("Token Symbol:", symbol);
  console.log("Initial Supply:", initialSupply.toString(), "wei (1,000,000 PULSE)");

  const balance = await publicClient.getBalance({ address: account.address });
  console.log("Deployer balance:", balance.toString(), "wei");

  if (balance < parseEther("0.001")) {
    throw new Error("Insufficient ETH for deployment gas");
  }

  // Check if there's a compiled artifact first
  let bytecode: `0x${string}`;
  let abi: unknown[];

  try {
    const { readFileSync } = await import("fs");
    const { resolve } = await import("path");
    const artifactPath = resolve(__dirname, "../packages/contracts/out/PulseToken.sol/PulseToken.json");
    const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
    bytecode = artifact.bytecode.object as `0x${string}`;
    abi = artifact.abi;
    console.log("\n✓ Using compiled artifact from forge build");
  } catch {
    console.log("\n⚠ No compiled artifact found. Please run 'forge build' in packages/contracts first.");
    console.log("  For now, you'll need to deploy using forge directly:");
    console.log(`  forge create src/PulseToken.sol:PulseToken \\\`);
    console.log(`    --constructor-args "Pulse" "PULSE" ${initialSupply} ${account.address} \\\`);
    console.log(`    --rpc-url ${RPC_URL} --private-key ${PRIVATE_KEY.slice(0, 6)}...`);
    process.exit(1);
  }

  // Deploy the token
  const hash = await walletClient.deployContract({
    abi: abi as readonly unknown[],
    bytecode,
    args: [name, symbol, initialSupply, account.address],
  });

  console.log("\nDeploy tx:", hash);
  console.log("Waiting for confirmation...");

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  
  if (!receipt.contractAddress) {
    throw new Error("Deployment failed - no contract address");
  }

  console.log("\n✅ PULSE Token deployed!");
  console.log("Address:", receipt.contractAddress);
  console.log("Block:", receipt.blockNumber);
  console.log("Gas used:", receipt.gasUsed.toString());

  console.log("\n=== Next Steps ===");
  console.log("1. Export the token address:");
  console.log(`   export PULSE_TOKEN_ADDRESS=${receipt.contractAddress}`);
  console.log("2. Verify on BaseScan:");
  console.log(`   forge verify-contract ${receipt.contractAddress} PulseToken --chain ${CHAIN_ID} --constructor-args $(cast abi-encode "constructor(string,string,uint256,address)" "${name}" "${symbol}" ${initialSupply} ${account.address})`);
  console.log("3. Deploy PulseRegistry using scripts/deploy-registry.ts");
  console.log("4. Set Vercel env vars using scripts/set-vercel-env.sh");

  // Write deployment info to file
  const deploymentInfo = {
    chainId: CHAIN_ID,
    chainName: chain.name,
    tokenAddress: receipt.contractAddress,
    deployer: account.address,
    name,
    symbol,
    initialSupply: initialSupply.toString(),
    blockNumber: receipt.blockNumber.toString(),
    transactionHash: hash,
    deployedAt: new Date().toISOString(),
  };

  const { writeFileSync } = await import("fs");
  const { resolve } = await import("path");
  const deploymentPath = resolve(__dirname, "../DEPLOYMENT.json");
  
  let existingDeployments: Record<string, unknown> = {};
  try {
    existingDeployments = JSON.parse(readFileSync(deploymentPath, "utf8"));
  } catch {
    // File doesn't exist yet
  }
  
  existingDeployments.pulseToken = deploymentInfo;
  writeFileSync(deploymentPath, JSON.stringify(existingDeployments, null, 2));
  console.log("\nDeployment info saved to:", deploymentPath);
}

main().catch((err) => {
  console.error("Deployment failed:", err.message);
  process.exit(1);
});
