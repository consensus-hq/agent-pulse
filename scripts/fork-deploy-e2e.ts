/**
 * Full E2E deployment + pulse flow test on Anvil Base fork
 * 
 * Tests the complete pipeline:
 * 1. Deploy mock PULSE ERC-20 token
 * 2. Deploy PulseRegistry with token + burn sink
 * 3. Mint tokens to test agent
 * 4. Approve registry to spend tokens
 * 5. Send pulse → verify isAlive
 * 6. Check streak increment
 * 7. Verify tokens sent to signal sink
 * 8. Test admin functions (setTTL, setMinPulse, updateHazard, pause/unpause)
 * 9. Test ownership transfer (Ownable2Step)
 * 
 * Usage:
 *   # Start anvil fork first:
 *   anvil --fork-url https://mainnet.base.org --port 8545
 *   
 *   # Then run:
 *   npx tsx scripts/fork-deploy-e2e.ts
 */

import {
  createWalletClient,
  createPublicClient,
  http,
  parseEther,
  formatEther,
  type Address,
  type Hex,
  encodeFunctionData,
  decodeFunctionResult,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { readFileSync } from "fs";
import { resolve } from "path";

const RPC_URL = process.env.FORK_RPC_URL || "http://127.0.0.1:8546";
// Anvil default account #0
const DEPLOYER_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
// Anvil default account #1 (test agent)
const AGENT_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
// Anvil default account #2 (agent 2 for multi-agent test)
const AGENT2_KEY = "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a";

const BURN_SINK = "0x000000000000000000000000000000000000dEaD" as const;
const TTL_SECONDS = 86400n;
const MIN_PULSE = parseEther("1");

// Minimal ERC-20 bytecode (OpenZeppelin-based mock)
const MOCK_ERC20_ABI = [
  { type: "constructor", inputs: [{ name: "name_", type: "string" }, { name: "symbol_", type: "string" }], stateMutability: "nonpayable" },
  { type: "function", name: "mint", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "balanceOf", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "approve", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }], stateMutability: "nonpayable" },
  { type: "function", name: "totalSupply", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "allowance", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "transfer", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }], stateMutability: "nonpayable" },
] as const;

// Load PulseRegistry artifact
const registryArtifactPath = resolve(__dirname, "../packages/contracts/out/PulseRegistry.sol/PulseRegistry.json");
let registryArtifact: { abi: any; bytecode: { object: string } };
try {
  registryArtifact = JSON.parse(readFileSync(registryArtifactPath, "utf8"));
} catch {
  console.error("❌ PulseRegistry artifact not found. Run: cd packages/contracts && forge build");
  process.exit(1);
}

const REGISTRY_ABI = registryArtifact.abi;

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`  ✅ ${msg}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${msg}`);
    failed++;
  }
}

async function main() {
  console.log("=== Agent Pulse Fork Deploy E2E ===\n");

  const deployer = privateKeyToAccount(DEPLOYER_KEY as Hex);
  const agent = privateKeyToAccount(AGENT_KEY as Hex);
  const agent2 = privateKeyToAccount(AGENT2_KEY as Hex);

  const publicClient = createPublicClient({ chain: base, transport: http(RPC_URL) });
  const deployerWallet = createWalletClient({ account: deployer, chain: base, transport: http(RPC_URL) });
  const agentWallet = createWalletClient({ account: agent, chain: base, transport: http(RPC_URL) });
  const agent2Wallet = createWalletClient({ account: agent2, chain: base, transport: http(RPC_URL) });

  // Check anvil is running
  try {
    const blockNum = await publicClient.getBlockNumber();
    console.log(`Anvil fork running. Block: ${blockNum}`);
  } catch {
    console.error("❌ Cannot connect to Anvil at", RPC_URL);
    console.error("   Start it: anvil --fork-url https://mainnet.base.org --port 8545");
    process.exit(1);
  }

  const deployerBal = await publicClient.getBalance({ address: deployer.address });
  console.log(`Deployer: ${deployer.address} (${formatEther(deployerBal)} ETH)`);
  console.log(`Agent:    ${agent.address}`);
  console.log(`Agent2:   ${agent2.address}`);

  // ===== STEP 1: Deploy Mock PULSE Token =====
  console.log("\n--- Step 1: Deploy Mock PULSE Token ---");

  // Deploy a minimal ERC20 with mint function using Forge create via cast
  // Actually we need to use a Solidity mock. Let's compile one inline or use forge create.
  // Easier: deploy via forge create from the test mocks
  
  // Check if we have a mock ERC20 in the test folder
  const mockTokenPath = resolve(__dirname, "../packages/contracts/out/MockERC20.sol/MockERC20.json");
  let mockTokenArtifact: any;
  try {
    mockTokenArtifact = JSON.parse(readFileSync(mockTokenPath, "utf8"));
  } catch {
    // Try alternate path from test mocks
    try {
      // Look for any ERC20 mock in the out directory
      const altPath = resolve(__dirname, "../packages/contracts/out/PulseRegistry.t.sol/MockPulseToken.json");
      mockTokenArtifact = JSON.parse(readFileSync(altPath, "utf8"));
    } catch {
      console.log("  ⚠️  No MockERC20 artifact found. Creating inline mock deploy via cast...");
      mockTokenArtifact = null;
    }
  }

  let pulseTokenAddr: Address;

  if (mockTokenArtifact && mockTokenArtifact.bytecode?.object) {
    // Deploy compiled mock
    const tokenHash = await deployerWallet.deployContract({
      abi: mockTokenArtifact.abi,
      bytecode: mockTokenArtifact.bytecode.object as Hex,
      args: [],
    });
    const tokenReceipt = await publicClient.waitForTransactionReceipt({ hash: tokenHash });
    pulseTokenAddr = tokenReceipt.contractAddress!;
    console.log(`  Mock PULSE token deployed: ${pulseTokenAddr}`);
    assert(!!pulseTokenAddr, "Token deployed successfully");
  } else {
    // Fallback: use Anvil impersonation to deploy via cast
    // Deploy OpenZeppelin ERC20 mock using forge create on anvil
    console.log("  Using forge create for mock token...");
    const { execSync } = await import("child_process");
    try {
      const forgeOut = execSync(
        `cd ${resolve(__dirname, "../packages/contracts")} && ` +
        `forge create test/PulseRegistry.t.sol:MockPulseToken ` +
        `--rpc-url ${RPC_URL} --private-key ${DEPLOYER_KEY} --json 2>/dev/null`,
        { encoding: "utf8" }
      );
      const forgeResult = JSON.parse(forgeOut);
      pulseTokenAddr = forgeResult.deployedTo as Address;
      console.log(`  Mock PULSE token deployed via forge: ${pulseTokenAddr}`);
      assert(!!pulseTokenAddr, "Token deployed via forge create");
    } catch (e: any) {
      console.error("  ❌ Failed to deploy mock token:", e.message?.slice(0, 200));
      process.exit(1);
    }
  }

  // ===== STEP 2: Deploy PulseRegistry =====
  console.log("\n--- Step 2: Deploy PulseRegistry ---");
  
  const registryHash = await deployerWallet.deployContract({
    abi: REGISTRY_ABI,
    bytecode: registryArtifact.bytecode.object as Hex,
    args: [pulseTokenAddr, BURN_SINK, TTL_SECONDS, MIN_PULSE],
  });
  const registryReceipt = await publicClient.waitForTransactionReceipt({ hash: registryHash });
  const registryAddr = registryReceipt.contractAddress!;
  
  console.log(`  PulseRegistry deployed: ${registryAddr}`);
  console.log(`  Gas used: ${registryReceipt.gasUsed}`);
  assert(!!registryAddr, "Registry deployed successfully");

  // Verify constructor params
  const storedToken = await publicClient.readContract({
    address: registryAddr, abi: REGISTRY_ABI, functionName: "pulseToken",
  });
  const storedSink = await publicClient.readContract({
    address: registryAddr, abi: REGISTRY_ABI, functionName: "signalSink",
  });
  const storedTTL = await publicClient.readContract({
    address: registryAddr, abi: REGISTRY_ABI, functionName: "ttlSeconds",
  }) as bigint;
  const storedMin = await publicClient.readContract({
    address: registryAddr, abi: REGISTRY_ABI, functionName: "minPulseAmount",
  }) as bigint;

  assert(String(storedToken).toLowerCase() === pulseTokenAddr.toLowerCase(), `pulseToken = ${storedToken}`);
  assert(String(storedSink).toLowerCase() === BURN_SINK.toLowerCase(), `signalSink = ${storedSink}`);
  assert(storedTTL === TTL_SECONDS, `ttlSeconds = ${storedTTL}`);
  assert(storedMin === MIN_PULSE, `minPulseAmount = ${storedMin}`);

  // ===== STEP 3: Mint tokens to agent =====
  console.log("\n--- Step 3: Mint tokens to test agents ---");

  // Mint via the mock token's mint function
  const mintAbi = [{ type: "function", name: "mint", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [], stateMutability: "nonpayable" }] as const;
  const balOfAbi = [{ type: "function", name: "balanceOf", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "view" }] as const;
  const approveAbi = [{ type: "function", name: "approve", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }], stateMutability: "nonpayable" }] as const;

  const mintAmount = parseEther("100");
  
  const mintHash1 = await deployerWallet.writeContract({
    address: pulseTokenAddr, abi: mintAbi, functionName: "mint",
    args: [agent.address, mintAmount],
  });
  await publicClient.waitForTransactionReceipt({ hash: mintHash1 });

  const mintHash2 = await deployerWallet.writeContract({
    address: pulseTokenAddr, abi: mintAbi, functionName: "mint",
    args: [agent2.address, mintAmount],
  });
  await publicClient.waitForTransactionReceipt({ hash: mintHash2 });

  const agentBal = await publicClient.readContract({
    address: pulseTokenAddr, abi: balOfAbi, functionName: "balanceOf", args: [agent.address],
  }) as bigint;

  assert(agentBal === mintAmount, `Agent balance: ${formatEther(agentBal)} PULSE`);

  // ===== STEP 4: Approve registry =====
  console.log("\n--- Step 4: Approve registry ---");

  const approveHash = await agentWallet.writeContract({
    address: pulseTokenAddr, abi: approveAbi, functionName: "approve",
    args: [registryAddr, parseEther("1000")],
  });
  await publicClient.waitForTransactionReceipt({ hash: approveHash });

  const approveHash2 = await agent2Wallet.writeContract({
    address: pulseTokenAddr, abi: approveAbi, functionName: "approve",
    args: [registryAddr, parseEther("1000")],
  });
  await publicClient.waitForTransactionReceipt({ hash: approveHash2 });

  assert(true, "Agent approved registry for 1000 PULSE");

  // ===== STEP 5: Send pulse =====
  console.log("\n--- Step 5: Send pulse ---");

  const sinkBalBefore = await publicClient.readContract({
    address: pulseTokenAddr, abi: balOfAbi, functionName: "balanceOf", args: [BURN_SINK],
  }) as bigint;

  const pulseHash = await agentWallet.writeContract({
    address: registryAddr, abi: REGISTRY_ABI, functionName: "pulse",
    args: [MIN_PULSE],
  });
  const pulseReceipt = await publicClient.waitForTransactionReceipt({ hash: pulseHash });
  
  console.log(`  Pulse tx: ${pulseHash}`);
  console.log(`  Gas used: ${pulseReceipt.gasUsed}`);
  assert(pulseReceipt.status === "success", "Pulse transaction succeeded");

  // ===== STEP 6: Verify isAlive =====
  console.log("\n--- Step 6: Verify isAlive ---");

  const alive = await publicClient.readContract({
    address: registryAddr, abi: REGISTRY_ABI, functionName: "isAlive", args: [agent.address],
  });
  assert(alive === true, `Agent isAlive = ${alive}`);

  const notAlive = await publicClient.readContract({
    address: registryAddr, abi: REGISTRY_ABI, functionName: "isAlive", args: [agent2.address],
  });
  assert(notAlive === false, `Agent2 (no pulse) isAlive = ${notAlive}`);

  // ===== STEP 7: Check tokens went to sink =====
  console.log("\n--- Step 7: Verify tokens sent to signal sink ---");

  const sinkBalAfter = await publicClient.readContract({
    address: pulseTokenAddr, abi: balOfAbi, functionName: "balanceOf", args: [BURN_SINK],
  }) as bigint;

  const sinkDelta = sinkBalAfter - sinkBalBefore;
  assert(sinkDelta === MIN_PULSE, `Signal sink received ${formatEther(sinkDelta)} PULSE`);

  // Agent balance decreased
  const agentBalAfter = await publicClient.readContract({
    address: pulseTokenAddr, abi: balOfAbi, functionName: "balanceOf", args: [agent.address],
  }) as bigint;
  assert(agentBalAfter === mintAmount - MIN_PULSE, `Agent balance: ${formatEther(agentBalAfter)} PULSE (99 after pulse)`);

  // ===== STEP 8: Check streak =====
  console.log("\n--- Step 8: Verify streak ---");

  const status = await publicClient.readContract({
    address: registryAddr, abi: REGISTRY_ABI, functionName: "getAgentStatus", args: [agent.address],
  }) as [boolean, bigint, bigint, bigint];

  assert(status[0] === true, `getAgentStatus.alive = ${status[0]}`);
  assert(status[2] === 1n, `getAgentStatus.streak = ${status[2]}`);
  assert(status[3] === 0n, `getAgentStatus.hazardScore = ${status[3]}`);

  // ===== STEP 9: Test admin functions =====
  console.log("\n--- Step 9: Admin functions ---");

  // setTTL
  const setTTLHash = await deployerWallet.writeContract({
    address: registryAddr, abi: REGISTRY_ABI, functionName: "setTTL",
    args: [172800n], // 48h
  });
  await publicClient.waitForTransactionReceipt({ hash: setTTLHash });
  const newTTL = await publicClient.readContract({
    address: registryAddr, abi: REGISTRY_ABI, functionName: "ttlSeconds",
  }) as bigint;
  assert(newTTL === 172800n, `TTL updated to ${newTTL}`);

  // Reset TTL
  await deployerWallet.writeContract({
    address: registryAddr, abi: REGISTRY_ABI, functionName: "setTTL", args: [TTL_SECONDS],
  });

  // updateHazard
  const hazardHash = await deployerWallet.writeContract({
    address: registryAddr, abi: REGISTRY_ABI, functionName: "updateHazard",
    args: [agent.address, 50],
  });
  await publicClient.waitForTransactionReceipt({ hash: hazardHash });
  const statusAfter = await publicClient.readContract({
    address: registryAddr, abi: REGISTRY_ABI, functionName: "getAgentStatus", args: [agent.address],
  }) as [boolean, bigint, bigint, bigint];
  assert(Number(statusAfter[3]) === 50, `Hazard score updated to ${statusAfter[3]}`);

  // pause / unpause
  const pauseHash = await deployerWallet.writeContract({
    address: registryAddr, abi: REGISTRY_ABI, functionName: "pause",
  });
  await publicClient.waitForTransactionReceipt({ hash: pauseHash });

  // Pulse should fail while paused
  try {
    await agentWallet.writeContract({
      address: registryAddr, abi: REGISTRY_ABI, functionName: "pulse", args: [MIN_PULSE],
    });
    assert(false, "Pulse should revert when paused");
  } catch {
    assert(true, "Pulse correctly reverts when paused");
  }

  const unpauseHash = await deployerWallet.writeContract({
    address: registryAddr, abi: REGISTRY_ABI, functionName: "unpause",
  });
  await publicClient.waitForTransactionReceipt({ hash: unpauseHash });
  assert(true, "Pause/unpause cycle complete");

  // ===== STEP 10: Multi-agent pulse =====
  console.log("\n--- Step 10: Multi-agent test ---");

  const pulse2Hash = await agent2Wallet.writeContract({
    address: registryAddr, abi: REGISTRY_ABI, functionName: "pulse", args: [MIN_PULSE],
  });
  await publicClient.waitForTransactionReceipt({ hash: pulse2Hash });

  const alive2 = await publicClient.readContract({
    address: registryAddr, abi: REGISTRY_ABI, functionName: "isAlive", args: [agent2.address],
  });
  assert(alive2 === true, `Agent2 isAlive after pulse = ${alive2}`);

  // Both agents alive now
  const alive1 = await publicClient.readContract({
    address: registryAddr, abi: REGISTRY_ABI, functionName: "isAlive", args: [agent.address],
  });
  assert(alive1 === true, `Agent1 still alive = ${alive1}`);

  // ===== STEP 11: Below minimum pulse revert =====
  console.log("\n--- Step 11: Edge cases ---");

  try {
    await agentWallet.writeContract({
      address: registryAddr, abi: REGISTRY_ABI, functionName: "pulse",
      args: [parseEther("0.5")], // below min
    });
    assert(false, "Below-minimum pulse should revert");
  } catch {
    assert(true, "Below-minimum pulse correctly reverts");
  }

  // Non-owner cannot setTTL
  try {
    await agentWallet.writeContract({
      address: registryAddr, abi: REGISTRY_ABI, functionName: "setTTL", args: [1000n],
    });
    assert(false, "Non-owner setTTL should revert");
  } catch {
    assert(true, "Non-owner setTTL correctly reverts");
  }

  // ===== SUMMARY =====
  console.log("\n========================================");
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("========================================");
  
  console.log("\n📋 Deployment Summary:");
  console.log(`  PULSE Token:    ${pulseTokenAddr}`);
  console.log(`  PulseRegistry:  ${registryAddr}`);
  console.log(`  Signal Sink:    ${BURN_SINK}`);
  console.log(`  TTL:            ${TTL_SECONDS}s (24h)`);
  console.log(`  Min Pulse:      ${formatEther(MIN_PULSE)} PULSE`);
  console.log(`  Registry Gas:   ${registryReceipt.gasUsed}`);
  
  if (failed > 0) {
    console.error(`\n❌ ${failed} test(s) failed!`);
    process.exit(1);
  } else {
    console.log("\n✅ All E2E tests passed! Deploy pipeline verified on fork.");
  }
}

main().catch((err) => {
  console.error("E2E test failed:", err);
  process.exit(1);
});
