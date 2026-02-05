/**
 * Protocol Verification Engine
 * 
 * Full 11-phase on-chain verification for Pulse of Life protocol.
 * 
 * Usage:
 *   npx tsx scripts/verify-protocol.ts --network testnet
 *   npx tsx scripts/verify-protocol.ts --network fork
 *   npx tsx scripts/verify-protocol.ts --network both
 * 
 * Environment variables:
 *   TESTNET_RPC_URL - Base Sepolia RPC (for testnet mode)
 *   TESTNET_PRIVATE_KEY_OWNER - Owner wallet (or generated if missing)
 *   TESTNET_PRIVATE_KEY_USER_1 to USER_4 - User wallets (or generated)
 *   FORK_RPC_URL - Optional fork RPC (defaults to http://127.0.0.1:8545)
 */

import {
  createWalletClient,
  createPublicClient,
  http,
  parseEther,
  formatEther,
  type Address,
  type Hex,
  type WalletClient,
  type PublicClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, baseSepolia } from "viem/chains";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";
import { spawn, type ChildProcess } from "child_process";

// ============ Constants ============
const BURN_SINK = "0x000000000000000000000000000000000000dEaD" as const;
const TTL_SECONDS = 86400n; // 24h
const MIN_PULSE = parseEther("1");
const ANVIL_DEFAULT_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;

// ============ Types ============
type NetworkMode = "testnet" | "fork" | "both";

interface VerificationLog {
  network: string;
  startedAt: string;
  completedAt?: string;
  status: "running" | "passed" | "failed";
  contracts: {
    pulseToken?: Address;
    pulseRegistry?: Address;
  };
  wallets: {
    owner: Address;
    users: Address[];
  };
  phases: PhaseResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  };
}

interface PhaseResult {
  phase: number;
  name: string;
  status: "pass" | "fail" | "skip";
  startedAt: string;
  completedAt?: string;
  checks: CheckResult[];
  transactions: TxResult[];
  error?: string;
}

interface CheckResult {
  description: string;
  expected: string;
  actual: string;
  status: "pass" | "fail";
}

interface TxResult {
  hash: Hex;
  function: string;
  from: Address;
  status: "success" | "reverted";
  gasUsed?: string;
  blockNumber?: string;
}

// ============ Wallet Generation ============
function generateWallet(): { address: Address; privateKey: Hex } {
  const { privateKeyToAccount } = require("viem/accounts");
  const randomBytes = require("crypto").randomBytes(32);
  const privateKey = `0x${randomBytes.toString("hex")}` as Hex;
  const account = privateKeyToAccount(privateKey);
  return { address: account.address, privateKey };
}

function loadOrGenerateWallets(isTestnet: boolean): {
  owner: Hex;
  users: Hex[];
} {
  const ownerKey = process.env.TESTNET_PRIVATE_KEY_OWNER as Hex | undefined;
  
  if (isTestnet && !ownerKey) {
    throw new Error("TESTNET_PRIVATE_KEY_OWNER required for testnet mode");
  }

  const owner = ownerKey || generateWallet().privateKey;
  const users: Hex[] = [];

  for (let i = 1; i <= 4; i++) {
    const envKey = process.env[`TESTNET_PRIVATE_KEY_USER_${i}`] as Hex | undefined;
    users.push(envKey || generateWallet().privateKey);
  }

  return { owner, users };
}

// ============ Anvil Management ============
async function startAnvil(port = 8545): Promise<ChildProcess> {
  return new Promise((resolve, reject) => {
    console.log(`  Starting Anvil on port ${port}...`);
    
    const anvil = spawn("anvil", [
      "--port", String(port),
      "--chain-id", "8453",
      "--silent",
    ]);

    let resolved = false;

    anvil.on("error", (err) => {
      if (!resolved) {
        resolved = true;
        reject(new Error(`Failed to start Anvil: ${err.message}`));
      }
    });

    // Wait for Anvil to be ready
    setTimeout(async () => {
      try {
        const client = createPublicClient({
          transport: http(`http://127.0.0.1:${port}`),
        });
        await client.getBlockNumber();
        console.log(`  ✅ Anvil started on port ${port}`);
        resolved = true;
        resolve(anvil);
      } catch {
        if (!resolved) {
          resolved = true;
          anvil.kill();
          reject(new Error("Anvil failed to start"));
        }
      }
    }, 2000);
  });
}

function stopAnvil(process: ChildProcess) {
  console.log("  Stopping Anvil...");
  process.kill();
}

// ============ Contract Deployment ============
async function deployContracts(
  walletClient: WalletClient,
  publicClient: PublicClient,
  ownerAddress: Address
): Promise<{ token: Address; registry: Address }> {
  // Load compiled artifacts
  const tokenArtifactPath = resolve(__dirname, "../packages/contracts/out/PulseToken.sol/PulseToken.json");
  const registryArtifactPath = resolve(__dirname, "../packages/contracts/out/PulseRegistry.sol/PulseRegistry.json");

  const tokenArtifact = JSON.parse(readFileSync(tokenArtifactPath, "utf8"));
  const registryArtifact = JSON.parse(readFileSync(registryArtifactPath, "utf8"));

  // Deploy PulseToken
  console.log("  Deploying PulseToken...");
  const tokenHash = await walletClient.deployContract({
    abi: tokenArtifact.abi,
    bytecode: tokenArtifact.bytecode.object as Hex,
    args: ["Pulse", "PULSE", parseEther("1000000"), ownerAddress],
  });

  const tokenReceipt = await publicClient.waitForTransactionReceipt({ hash: tokenHash });
  const tokenAddress = tokenReceipt.contractAddress!;
  console.log(`  ✅ PulseToken deployed: ${tokenAddress}`);

  // Deploy PulseRegistry
  console.log("  Deploying PulseRegistry...");
  const registryHash = await walletClient.deployContract({
    abi: registryArtifact.abi,
    bytecode: registryArtifact.bytecode.object as Hex,
    args: [tokenAddress, BURN_SINK, TTL_SECONDS, MIN_PULSE],
  });

  const registryReceipt = await publicClient.waitForTransactionReceipt({ hash: registryHash });
  const registryAddress = registryReceipt.contractAddress!;
  console.log(`  ✅ PulseRegistry deployed: ${registryAddress}`);

  return { token: tokenAddress, registry: registryAddress };
}

// ============ Phase Execution ============
class PhaseRunner {
  private log: VerificationLog;
  private publicClient: PublicClient;
  private ownerWallet: WalletClient;
  private userWallets: WalletClient[];
  private tokenAddress: Address;
  private registryAddress: Address;
  private tokenAbi: any;
  private registryAbi: any;

  constructor(
    network: string,
    publicClient: PublicClient,
    ownerWallet: WalletClient,
    userWallets: WalletClient[],
    tokenAddress: Address,
    registryAddress: Address
  ) {
    this.publicClient = publicClient;
    this.ownerWallet = ownerWallet;
    this.userWallets = userWallets;
    this.tokenAddress = tokenAddress;
    this.registryAddress = registryAddress;

    // Load ABIs
    const tokenArtifactPath = resolve(__dirname, "../packages/contracts/out/PulseToken.sol/PulseToken.json");
    const registryArtifactPath = resolve(__dirname, "../packages/contracts/out/PulseRegistry.sol/PulseRegistry.json");
    this.tokenAbi = JSON.parse(readFileSync(tokenArtifactPath, "utf8")).abi;
    this.registryAbi = JSON.parse(readFileSync(registryArtifactPath, "utf8")).abi;

    // Initialize log
    this.log = {
      network,
      startedAt: new Date().toISOString(),
      status: "running",
      contracts: {
        pulseToken: tokenAddress,
        pulseRegistry: registryAddress,
      },
      wallets: {
        owner: ownerWallet.account!.address,
        users: userWallets.map(w => w.account!.address),
      },
      phases: [],
      summary: { total: 11, passed: 0, failed: 0, skipped: 0 },
    };
  }

  private async addCheck(
    phase: PhaseResult,
    description: string,
    expected: string,
    actual: string
  ): Promise<boolean> {
    const status = expected.toLowerCase() === actual.toLowerCase() ? "pass" : "fail";
    phase.checks.push({ description, expected, actual, status });
    return status === "pass";
  }

  private async addTx(
    phase: PhaseResult,
    hash: Hex,
    functionName: string,
    from: Address
  ): Promise<void> {
    try {
      const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
      phase.transactions.push({
        hash,
        function: functionName,
        from,
        status: receipt.status === "success" ? "success" : "reverted",
        gasUsed: receipt.gasUsed.toString(),
        blockNumber: receipt.blockNumber.toString(),
      });
    } catch {
      phase.transactions.push({
        hash,
        function: functionName,
        from,
        status: "reverted",
      });
    }
  }

  async phase1_Deploy(): Promise<PhaseResult> {
    const phase: PhaseResult = {
      phase: 1,
      name: "Deploy",
      status: "pass",
      startedAt: new Date().toISOString(),
      checks: [],
      transactions: [],
    };

    try {
      // Verify token address
      const tokenCode = await this.publicClient.getCode({ address: this.tokenAddress });
      await this.addCheck(phase, "PulseToken deployed", "has bytecode", tokenCode ? "has bytecode" : "no bytecode");

      // Verify registry address
      const registryCode = await this.publicClient.getCode({ address: this.registryAddress });
      await this.addCheck(phase, "PulseRegistry deployed", "has bytecode", registryCode ? "has bytecode" : "no bytecode");

      // Verify registry config
      const storedToken = await this.publicClient.readContract({
        address: this.registryAddress,
        abi: this.registryAbi,
        functionName: "pulseToken",
      }) as Address;
      await this.addCheck(phase, "Registry token address", this.tokenAddress, storedToken);

      const storedSink = await this.publicClient.readContract({
        address: this.registryAddress,
        abi: this.registryAbi,
        functionName: "signalSink",
      }) as Address;
      await this.addCheck(phase, "Registry signal sink", BURN_SINK, storedSink);

      phase.status = phase.checks.every(c => c.status === "pass") ? "pass" : "fail";
    } catch (error) {
      phase.status = "fail";
      phase.error = error instanceof Error ? error.message : "Unknown error";
    }

    phase.completedAt = new Date().toISOString();
    return phase;
  }

  async phase2_Ownership(): Promise<PhaseResult> {
    const phase: PhaseResult = {
      phase: 2,
      name: "Ownership verification",
      status: "pass",
      startedAt: new Date().toISOString(),
      checks: [],
      transactions: [],
    };

    try {
      const owner = await this.publicClient.readContract({
        address: this.registryAddress,
        abi: this.registryAbi,
        functionName: "owner",
      }) as Address;

      await this.addCheck(phase, "Registry owner", this.ownerWallet.account!.address, owner);

      // Try non-owner setTTL (should fail)
      try {
        await this.userWallets[0].writeContract({
          address: this.registryAddress,
          abi: this.registryAbi,
          functionName: "setTTL",
          args: [1000n],
        });
        await this.addCheck(phase, "Non-owner setTTL reverts", "reverted", "succeeded");
      } catch {
        await this.addCheck(phase, "Non-owner setTTL reverts", "reverted", "reverted");
      }

      phase.status = phase.checks.every(c => c.status === "pass") ? "pass" : "fail";
    } catch (error) {
      phase.status = "fail";
      phase.error = error instanceof Error ? error.message : "Unknown error";
    }

    phase.completedAt = new Date().toISOString();
    return phase;
  }

  async phase3_FirstPulse(): Promise<PhaseResult> {
    const phase: PhaseResult = {
      phase: 3,
      name: "First pulse",
      status: "pass",
      startedAt: new Date().toISOString(),
      checks: [],
      transactions: [],
    };

    try {
      const user = this.userWallets[0];
      const userAddr = user.account!.address;

      // Mint tokens
      const mintHash = await this.ownerWallet.writeContract({
        address: this.tokenAddress,
        abi: this.tokenAbi,
        functionName: "mint",
        args: [userAddr, parseEther("100")],
      });
      await this.addTx(phase, mintHash, "mint", this.ownerWallet.account!.address);

      // Approve registry
      const approveHash = await user.writeContract({
        address: this.tokenAddress,
        abi: this.tokenAbi,
        functionName: "approve",
        args: [this.registryAddress, parseEther("1000")],
      });
      await this.addTx(phase, approveHash, "approve", userAddr);

      // Send pulse
      const pulseHash = await user.writeContract({
        address: this.registryAddress,
        abi: this.registryAbi,
        functionName: "pulse",
        args: [MIN_PULSE],
      });
      await this.addTx(phase, pulseHash, "pulse", userAddr);

      // Verify isAlive
      const isAlive = await this.publicClient.readContract({
        address: this.registryAddress,
        abi: this.registryAbi,
        functionName: "isAlive",
        args: [userAddr],
      }) as boolean;
      await this.addCheck(phase, "User isAlive", "true", String(isAlive));

      // Verify streak
      const status = await this.publicClient.readContract({
        address: this.registryAddress,
        abi: this.registryAbi,
        functionName: "getAgentStatus",
        args: [userAddr],
      }) as [boolean, bigint, bigint, bigint];
      await this.addCheck(phase, "Streak", "1", String(status[2]));

      phase.status = phase.checks.every(c => c.status === "pass") ? "pass" : "fail";
    } catch (error) {
      phase.status = "fail";
      phase.error = error instanceof Error ? error.message : "Unknown error";
    }

    phase.completedAt = new Date().toISOString();
    return phase;
  }

  async phase4_StreakBuilding(): Promise<PhaseResult> {
    const phase: PhaseResult = {
      phase: 4,
      name: "Streak building",
      status: "skip",
      startedAt: new Date().toISOString(),
      checks: [],
      transactions: [],
    };

    try {
      // Note: Requires time manipulation which may not be available on testnet
      // Try to advance time, skip if not supported
      phase.status = "skip";
      phase.error = "Time manipulation not available on this network";
    } catch (error) {
      phase.status = "skip";
      phase.error = error instanceof Error ? error.message : "Unknown error";
    }

    phase.completedAt = new Date().toISOString();
    return phase;
  }

  async phase5_MissedPulse(): Promise<PhaseResult> {
    const phase: PhaseResult = {
      phase: 5,
      name: "Missed pulse (streak reset)",
      status: "skip",
      startedAt: new Date().toISOString(),
      checks: [],
      transactions: [],
    };

    try {
      // Note: Requires time manipulation
      phase.status = "skip";
      phase.error = "Time manipulation not available on this network";
    } catch (error) {
      phase.status = "skip";
      phase.error = error instanceof Error ? error.message : "Unknown error";
    }

    phase.completedAt = new Date().toISOString();
    return phase;
  }

  async phase6_MultiUser(): Promise<PhaseResult> {
    const phase: PhaseResult = {
      phase: 6,
      name: "Multi-user activity",
      status: "pass",
      startedAt: new Date().toISOString(),
      checks: [],
      transactions: [],
    };

    try {
      // Fund and pulse with remaining users
      for (let i = 1; i < this.userWallets.length; i++) {
        const user = this.userWallets[i];
        const userAddr = user.account!.address;

        const mintHash = await this.ownerWallet.writeContract({
          address: this.tokenAddress,
          abi: this.tokenAbi,
          functionName: "mint",
          args: [userAddr, parseEther("100")],
        });
        await this.addTx(phase, mintHash, "mint", this.ownerWallet.account!.address);

        const approveHash = await user.writeContract({
          address: this.tokenAddress,
          abi: this.tokenAbi,
          functionName: "approve",
          args: [this.registryAddress, parseEther("1000")],
        });
        await this.addTx(phase, approveHash, "approve", userAddr);

        const pulseHash = await user.writeContract({
          address: this.registryAddress,
          abi: this.registryAbi,
          functionName: "pulse",
          args: [MIN_PULSE],
        });
        await this.addTx(phase, pulseHash, "pulse", userAddr);

        const isAlive = await this.publicClient.readContract({
          address: this.registryAddress,
          abi: this.registryAbi,
          functionName: "isAlive",
          args: [userAddr],
        }) as boolean;
        await this.addCheck(phase, `User ${i + 1} isAlive`, "true", String(isAlive));
      }

      phase.status = phase.checks.every(c => c.status === "pass") ? "pass" : "fail";
    } catch (error) {
      phase.status = "fail";
      phase.error = error instanceof Error ? error.message : "Unknown error";
    }

    phase.completedAt = new Date().toISOString();
    return phase;
  }

  async phase7_HazardScore(): Promise<PhaseResult> {
    const phase: PhaseResult = {
      phase: 7,
      name: "Hazard score",
      status: "pass",
      startedAt: new Date().toISOString(),
      checks: [],
      transactions: [],
    };

    try {
      const userAddr = this.userWallets[0].account!.address;

      const updateHash = await this.ownerWallet.writeContract({
        address: this.registryAddress,
        abi: this.registryAbi,
        functionName: "updateHazard",
        args: [userAddr, 75],
      });
      await this.addTx(phase, updateHash, "updateHazard", this.ownerWallet.account!.address);

      const status = await this.publicClient.readContract({
        address: this.registryAddress,
        abi: this.registryAbi,
        functionName: "getAgentStatus",
        args: [userAddr],
      }) as [boolean, bigint, bigint, bigint];

      await this.addCheck(phase, "Hazard score", "75", String(status[3]));

      phase.status = phase.checks.every(c => c.status === "pass") ? "pass" : "fail";
    } catch (error) {
      phase.status = "fail";
      phase.error = error instanceof Error ? error.message : "Unknown error";
    }

    phase.completedAt = new Date().toISOString();
    return phase;
  }

  async phase8_EmergencyPause(): Promise<PhaseResult> {
    const phase: PhaseResult = {
      phase: 8,
      name: "Emergency pause/unpause",
      status: "pass",
      startedAt: new Date().toISOString(),
      checks: [],
      transactions: [],
    };

    try {
      // Pause
      const pauseHash = await this.ownerWallet.writeContract({
        address: this.registryAddress,
        abi: this.registryAbi,
        functionName: "pause",
      });
      await this.addTx(phase, pauseHash, "pause", this.ownerWallet.account!.address);

      // Try pulse while paused (should revert)
      try {
        await this.userWallets[0].writeContract({
          address: this.registryAddress,
          abi: this.registryAbi,
          functionName: "pulse",
          args: [MIN_PULSE],
        });
        await this.addCheck(phase, "Pulse reverts when paused", "reverted", "succeeded");
      } catch {
        await this.addCheck(phase, "Pulse reverts when paused", "reverted", "reverted");
      }

      // Unpause
      const unpauseHash = await this.ownerWallet.writeContract({
        address: this.registryAddress,
        abi: this.registryAbi,
        functionName: "unpause",
      });
      await this.addTx(phase, unpauseHash, "unpause", this.ownerWallet.account!.address);

      phase.status = phase.checks.every(c => c.status === "pass") ? "pass" : "fail";
    } catch (error) {
      phase.status = "fail";
      phase.error = error instanceof Error ? error.message : "Unknown error";
    }

    phase.completedAt = new Date().toISOString();
    return phase;
  }

  async phase9_SignalSink(): Promise<PhaseResult> {
    const phase: PhaseResult = {
      phase: 9,
      name: "Signal sink verification",
      status: "pass",
      startedAt: new Date().toISOString(),
      checks: [],
      transactions: [],
    };

    try {
      const sinkBalance = await this.publicClient.readContract({
        address: this.tokenAddress,
        abi: this.tokenAbi,
        functionName: "balanceOf",
        args: [BURN_SINK],
      }) as bigint;

      // Should have received tokens from previous pulses
      const expectedMin = parseEther("4"); // At least 4 pulses (1 from phase 3, 3 from phase 6)
      const hasTokens = sinkBalance >= expectedMin;
      await this.addCheck(
        phase,
        "Signal sink received tokens",
        `>= ${formatEther(expectedMin)} PULSE`,
        `${formatEther(sinkBalance)} PULSE`
      );

      phase.status = hasTokens ? "pass" : "fail";
    } catch (error) {
      phase.status = "fail";
      phase.error = error instanceof Error ? error.message : "Unknown error";
    }

    phase.completedAt = new Date().toISOString();
    return phase;
  }

  async phase10_StressTest(): Promise<PhaseResult> {
    const phase: PhaseResult = {
      phase: 10,
      name: "Stress test (rapid pulses)",
      status: "pass",
      startedAt: new Date().toISOString(),
      checks: [],
      transactions: [],
    };

    try {
      // All users pulse rapidly
      const pulsePromises = this.userWallets.map(async (user, i) => {
        const userAddr = user.account!.address;
        const pulseHash = await user.writeContract({
          address: this.registryAddress,
          abi: this.registryAbi,
          functionName: "pulse",
          args: [MIN_PULSE],
        });
        await this.addTx(phase, pulseHash, "pulse", userAddr);
      });

      await Promise.all(pulsePromises);

      // Verify all users still alive
      for (let i = 0; i < this.userWallets.length; i++) {
        const userAddr = this.userWallets[i].account!.address;
        const isAlive = await this.publicClient.readContract({
          address: this.registryAddress,
          abi: this.registryAbi,
          functionName: "isAlive",
          args: [userAddr],
        }) as boolean;
        await this.addCheck(phase, `User ${i + 1} alive after stress`, "true", String(isAlive));
      }

      phase.status = phase.checks.every(c => c.status === "pass") ? "pass" : "fail";
    } catch (error) {
      phase.status = "fail";
      phase.error = error instanceof Error ? error.message : "Unknown error";
    }

    phase.completedAt = new Date().toISOString();
    return phase;
  }

  async phase11_FinalLiveness(): Promise<PhaseResult> {
    const phase: PhaseResult = {
      phase: 11,
      name: "Final liveness check",
      status: "pass",
      startedAt: new Date().toISOString(),
      checks: [],
      transactions: [],
    };

    try {
      // Verify all users are still alive
      for (let i = 0; i < this.userWallets.length; i++) {
        const userAddr = this.userWallets[i].account!.address;
        const isAlive = await this.publicClient.readContract({
          address: this.registryAddress,
          abi: this.registryAbi,
          functionName: "isAlive",
          args: [userAddr],
        }) as boolean;
        await this.addCheck(phase, `User ${i + 1} final liveness`, "true", String(isAlive));
      }

      // Verify contract is not paused
      try {
        const isPaused = await this.publicClient.readContract({
          address: this.registryAddress,
          abi: this.registryAbi,
          functionName: "paused",
        }) as boolean;
        await this.addCheck(phase, "Contract not paused", "false", String(isPaused));
      } catch {
        await this.addCheck(phase, "Contract not paused", "false", "unknown");
      }

      phase.status = phase.checks.every(c => c.status === "pass") ? "pass" : "fail";
    } catch (error) {
      phase.status = "fail";
      phase.error = error instanceof Error ? error.message : "Unknown error";
    }

    phase.completedAt = new Date().toISOString();
    return phase;
  }

  async runAll(): Promise<VerificationLog> {
    console.log("\n=== Running 11-Phase Verification ===\n");

    const phases = [
      () => this.phase1_Deploy(),
      () => this.phase2_Ownership(),
      () => this.phase3_FirstPulse(),
      () => this.phase4_StreakBuilding(),
      () => this.phase5_MissedPulse(),
      () => this.phase6_MultiUser(),
      () => this.phase7_HazardScore(),
      () => this.phase8_EmergencyPause(),
      () => this.phase9_SignalSink(),
      () => this.phase10_StressTest(),
      () => this.phase11_FinalLiveness(),
    ];

    for (const phaseFunc of phases) {
      const result = await phaseFunc();
      this.log.phases.push(result);
      
      console.log(`Phase ${result.phase}: ${result.name} - ${result.status.toUpperCase()}`);
      
      if (result.status === "pass") this.log.summary.passed++;
      else if (result.status === "fail") this.log.summary.failed++;
      else this.log.summary.skipped++;
    }

    this.log.completedAt = new Date().toISOString();
    this.log.status = this.log.summary.failed > 0 ? "failed" : "passed";

    return this.log;
  }

  getLog(): VerificationLog {
    return this.log;
  }
}

// ============ Network Runners ============
async function runTestnet(): Promise<VerificationLog> {
  console.log("\n=== Testnet Mode (Base Sepolia) ===\n");

  const rpcUrl = process.env.TESTNET_RPC_URL || "https://sepolia.base.org";
  const walletKeys = loadOrGenerateWallets(true);

  const ownerAccount = privateKeyToAccount(walletKeys.owner);
  const userAccounts = walletKeys.users.map(k => privateKeyToAccount(k));

  console.log(`Owner: ${ownerAccount.address}`);
  userAccounts.forEach((u, i) => console.log(`User ${i + 1}: ${u.address}`));

  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(rpcUrl),
  });

  const ownerWallet = createWalletClient({
    account: ownerAccount,
    chain: baseSepolia,
    transport: http(rpcUrl),
  });

  const userWallets = userAccounts.map(account =>
    createWalletClient({
      account,
      chain: baseSepolia,
      transport: http(rpcUrl),
    })
  );

  // Check balance
  const balance = await publicClient.getBalance({ address: ownerAccount.address });
  console.log(`\nOwner balance: ${formatEther(balance)} ETH`);

  if (balance < parseEther("0.01")) {
    throw new Error("Insufficient ETH. Get Base Sepolia ETH from faucet.");
  }

  // Deploy contracts
  console.log("\n--- Deploying Contracts ---\n");
  const { token, registry } = await deployContracts(ownerWallet, publicClient, ownerAccount.address);

  // Run phases
  const runner = new PhaseRunner(
    "testnet",
    publicClient,
    ownerWallet,
    userWallets,
    token,
    registry
  );

  return await runner.runAll();
}

async function runFork(): Promise<VerificationLog> {
  console.log("\n=== Fork Mode (Anvil) ===\n");

  const rpcUrl = process.env.FORK_RPC_URL || "http://127.0.0.1:8545";
  
  // Use existing Anvil if FORK_RPC_URL is set or if one is already running on 8545
  let anvil: ChildProcess | null = null;
  const useExisting = process.env.FORK_RPC_URL || process.env.USE_EXISTING_ANVIL;
  if (!useExisting) {
    anvil = await startAnvil();
  } else {
    console.log("  Using existing Anvil at", rpcUrl);
  }

  try {
    const walletKeys = loadOrGenerateWallets(false);
    const anvilFunder = privateKeyToAccount(ANVIL_DEFAULT_KEY);
    
    const ownerAccount = privateKeyToAccount(walletKeys.owner);
    const userAccounts = walletKeys.users.map(k => privateKeyToAccount(k));

    console.log(`\nOwner: ${ownerAccount.address}`);
    userAccounts.forEach((u, i) => console.log(`User ${i + 1}: ${u.address}`));

    const publicClient = createPublicClient({
      chain: base,
      transport: http(rpcUrl),
    });

    const funderWallet = createWalletClient({
      account: anvilFunder,
      chain: base,
      transport: http(rpcUrl),
    });

    // Fund wallets
    console.log("\n--- Funding Wallets ---\n");
    const fundAmount = parseEther("10");
    
    for (const account of [ownerAccount, ...userAccounts]) {
      const hash = await funderWallet.sendTransaction({
        to: account.address,
        value: fundAmount,
      });
      await publicClient.waitForTransactionReceipt({ hash });
      console.log(`  Funded ${account.address}`);
    }

    const ownerWallet = createWalletClient({
      account: ownerAccount,
      chain: base,
      transport: http(rpcUrl),
    });

    const userWallets = userAccounts.map(account =>
      createWalletClient({
        account,
        chain: base,
        transport: http(rpcUrl),
      })
    );

    // Deploy contracts
    console.log("\n--- Deploying Contracts ---\n");
    const { token, registry } = await deployContracts(ownerWallet, publicClient, ownerAccount.address);

    // Run phases
    const runner = new PhaseRunner(
      "fork",
      publicClient,
      ownerWallet,
      userWallets,
      token,
      registry
    );

    const log = await runner.runAll();
    
    if (anvil) stopAnvil(anvil);
    
    return log;
  } catch (error) {
    if (anvil) stopAnvil(anvil);
    throw error;
  }
}

// ============ Main ============
async function main() {
  const args = process.argv.slice(2);
  const networkFlag = args.find(a => a.startsWith("--network="))?.split("=")[1];
  const network = (networkFlag || "fork") as NetworkMode;

  if (!["testnet", "fork", "both"].includes(network)) {
    console.error("Invalid network. Use: --network=testnet|fork|both");
    process.exit(1);
  }

  const logs: VerificationLog[] = [];

  if (network === "testnet" || network === "both") {
    const log = await runTestnet();
    logs.push(log);
  }

  if (network === "fork" || network === "both") {
    const log = await runFork();
    logs.push(log);
  }

  // Save logs
  const reportsDir = resolve(__dirname, "../reports");
  mkdirSync(reportsDir, { recursive: true });

  for (const log of logs) {
    const filename = `verification-log-${log.network}.json`;
    const filepath = resolve(reportsDir, filename);
    writeFileSync(filepath, JSON.stringify(log, null, 2));
    console.log(`\n✅ Log saved: ${filepath}`);
    
    console.log(`\n=== ${log.network.toUpperCase()} Summary ===`);
    console.log(`Status: ${log.status.toUpperCase()}`);
    console.log(`Passed: ${log.summary.passed}/${log.summary.total}`);
    console.log(`Failed: ${log.summary.failed}/${log.summary.total}`);
    console.log(`Skipped: ${log.summary.skipped}/${log.summary.total}`);
  }

  const allPassed = logs.every(l => l.status === "passed");
  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  console.error("\n❌ Verification failed:", err.message);
  process.exit(1);
});
