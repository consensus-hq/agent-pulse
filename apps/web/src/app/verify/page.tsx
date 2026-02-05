"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { createPublicClient, http, type Address, type PublicClient } from "viem";
import styles from "./verify.module.css";

// ============ Types ============
type NetworkMode = "testnet" | "fork" | "mainnet";

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
  hash: string;
  function: string;
  from: Address;
  status: "success" | "reverted";
  gasUsed?: string;
  blockNumber?: string;
}

interface AgentNode {
  address: Address;
  label: string;
  isAlive: boolean;
  streak: number;
  hazard: number;
}

interface NetworkConfig {
  rpcUrl: string;
  registryAddress: Address | null;
  tokenAddress: Address | null;
  explorerBase: string;
  label: string;
  logUrl: string | null;
}

// ============ Network Configurations ============
const getNetworkConfig = (mode: NetworkMode): NetworkConfig => {
  switch (mode) {
    case "testnet":
      return {
        rpcUrl: process.env.NEXT_PUBLIC_TESTNET_RPC_URL || "https://sepolia.base.org",
        registryAddress: (process.env.NEXT_PUBLIC_TESTNET_REGISTRY_ADDRESS as Address) || null,
        tokenAddress: (process.env.NEXT_PUBLIC_TESTNET_TOKEN_ADDRESS as Address) || null,
        explorerBase: "https://sepolia.basescan.org/tx/",
        label: "Base Sepolia Testnet",
        logUrl: process.env.NEXT_PUBLIC_VERIFY_LOG_TESTNET_URL || null,
      };
    case "fork":
      return {
        rpcUrl: process.env.NEXT_PUBLIC_FORK_RPC_URL || "http://127.0.0.1:8545",
        registryAddress: (process.env.NEXT_PUBLIC_FORK_REGISTRY_ADDRESS as Address) || null,
        tokenAddress: (process.env.NEXT_PUBLIC_FORK_TOKEN_ADDRESS as Address) || null,
        explorerBase: "https://basescan.org/tx/",
        label: "Local Fork (Anvil)",
        logUrl: process.env.NEXT_PUBLIC_VERIFY_LOG_FORK_URL || null,
      };
    case "mainnet":
    default:
      return {
        rpcUrl: process.env.NEXT_PUBLIC_BASE_RPC_URL || "https://mainnet.base.org",
        registryAddress: (process.env.NEXT_PUBLIC_PULSE_REGISTRY_ADDRESS as Address) || null,
        tokenAddress: (process.env.NEXT_PUBLIC_PULSE_TOKEN_ADDRESS as Address) || null,
        explorerBase: "https://basescan.org/tx/",
        label: "Base Mainnet",
        logUrl: process.env.NEXT_PUBLIC_VERIFY_LOG_MAINNET_URL || null,
      };
  }
};

// ============ Minimal ABI ============
const REGISTRY_ABI = [
  {
    type: "function",
    name: "getAgentStatus",
    stateMutability: "view",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [
      { name: "alive", type: "bool" },
      { name: "lastPulseAt", type: "uint256" },
      { name: "streak", type: "uint256" },
      { name: "hazardScore", type: "uint256" },
    ],
  },
  {
    type: "event",
    name: "Pulse",
    inputs: [
      { name: "agent", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "timestamp", type: "uint256", indexed: false },
      { name: "streak", type: "uint256", indexed: false },
    ],
    anonymous: false,
  },
] as const;

// ============ Utilities ============
const shortenAddress = (addr: string) => {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
};

const formatTime = (iso: string) => {
  const date = new Date(iso);
  return date.toLocaleTimeString();
};

// ============ Main Component ============
export default function VerifyPage() {
  const [mode, setMode] = useState<NetworkMode>("fork");
  const [replayLog, setReplayLog] = useState<VerificationLog | null>(null);
  const [replayIndex, setReplayIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [liveNodes, setLiveNodes] = useState<AgentNode[]>([]);
  const [currentBlock, setCurrentBlock] = useState<bigint | null>(null);
  const [error, setError] = useState<string | null>(null);

  const config = useMemo(() => getNetworkConfig(mode), [mode]);

  // ============ RPC Client ============
  const publicClient = useMemo<PublicClient | null>(() => {
    if (!config.rpcUrl) return null;
    try {
      return createPublicClient({
        transport: http(config.rpcUrl, { timeout: 10000 }),
      });
    } catch {
      return null;
    }
  }, [config.rpcUrl]);

  // ============ Load Verification Log ============
  const loadLog = useCallback(async () => {
    if (!config.logUrl) return;
    try {
      const response = await fetch(config.logUrl);
      if (!response.ok) throw new Error("Log not found");
      const data = await response.json();
      setReplayLog(data);
      setReplayIndex(0);
      setError(null);
    } catch (err) {
      setError(`Failed to load log: ${err instanceof Error ? err.message : "Unknown"}`);
      setReplayLog(null);
    }
  }, [config.logUrl]);

  useEffect(() => {
    loadLog();
  }, [loadLog]);

  // ============ Fetch Live Data ============
  useEffect(() => {
    if (!publicClient || !config.registryAddress || replayLog) return;

    const fetchLiveData = async () => {
      try {
        const blockNum = await publicClient.getBlockNumber();
        setCurrentBlock(blockNum);
        setError(null);
      } catch (err) {
        setError(`RPC error: ${err instanceof Error ? err.message : "Unknown"}`);
      }
    };

    fetchLiveData();
    const interval = setInterval(fetchLiveData, 15000);
    return () => clearInterval(interval);
  }, [publicClient, config.registryAddress, replayLog]);

  // ============ Replay Controls ============
  useEffect(() => {
    if (!isPlaying || !replayLog) return;

    const totalEvents = replayLog.phases.reduce(
      (sum, p) => sum + p.transactions.length,
      0
    );

    if (replayIndex >= totalEvents) {
      setIsPlaying(false);
      return;
    }

    const timer = setTimeout(() => {
      setReplayIndex((i) => i + 1);
    }, 500);

    return () => clearTimeout(timer);
  }, [isPlaying, replayIndex, replayLog]);

  // ============ Derived Data ============
  const replayTransactions = useMemo(() => {
    if (!replayLog) return [];
    return replayLog.phases.flatMap((p) => p.transactions);
  }, [replayLog]);

  const replayPhases = useMemo(() => {
    if (!replayLog) return [];
    return replayLog.phases;
  }, [replayLog]);

  const visibleTransactions = useMemo(() => {
    return replayTransactions.slice(0, replayIndex).reverse().slice(0, 12);
  }, [replayTransactions, replayIndex]);

  const metrics = useMemo(() => {
    if (!replayLog) {
      return {
        totalPulses: 0,
        activeWallets: 0,
        avgGas: "—",
        streakLeader: null as AgentNode | null,
      };
    }

    const pulses = replayTransactions
      .slice(0, replayIndex)
      .filter((tx) => tx.function === "pulse");
    const totalPulses = pulses.length;

    const uniqueWallets = new Set(pulses.map((tx) => tx.from));
    const activeWallets = uniqueWallets.size;

    const gasValues = pulses
      .map((tx) => (tx.gasUsed ? BigInt(tx.gasUsed) : 0n))
      .filter((g) => g > 0n);
    const avgGas =
      gasValues.length > 0
        ? (gasValues.reduce((a, b) => a + b, 0n) / BigInt(gasValues.length)).toString()
        : "—";

    // Find streak leader from latest phase data
    let streakLeader: AgentNode | null = null;
    for (let i = replayPhases.length - 1; i >= 0; i--) {
      const phase = replayPhases[i];
      const streakCheck = phase.checks.find((c) => c.description.includes("Streak"));
      if (streakCheck) {
        const streakValue = parseInt(streakCheck.actual);
        if (!isNaN(streakValue) && (!streakLeader || streakValue > streakLeader.streak)) {
          streakLeader = {
            address: "0x0000000000000000000000000000000000000000" as Address,
            label: "Agent",
            isAlive: true,
            streak: streakValue,
            hazard: 0,
          };
        }
      }
    }

    return { totalPulses, activeWallets, avgGas, streakLeader };
  }, [replayLog, replayTransactions, replayIndex, replayPhases]);

  // ============ Network Topology ============
  const renderTopology = () => {
    if (!replayLog) {
      return (
        <div className={styles.topologyEmpty}>
          <p>No data available</p>
          <p className={styles.muted}>Load a verification log to see network topology</p>
        </div>
      );
    }

    const { contracts, wallets } = replayLog;
    const centerX = 200;
    const centerY = 150;
    const radius = 100;

    const nodes = [
      { label: "Registry", address: contracts.pulseRegistry, type: "contract" },
      { label: "Token", address: contracts.pulseToken, type: "contract" },
      ...wallets.users.map((addr, i) => ({
        label: `User ${i + 1}`,
        address: addr,
        type: "agent",
      })),
    ];

    const angleStep = (2 * Math.PI) / nodes.length;

    return (
      <svg className={styles.topology} viewBox="0 0 400 300">
        {/* Center node (Owner) */}
        <circle cx={centerX} cy={centerY} r="20" className={styles.nodeCenter} />
        <text x={centerX} y={centerY + 5} className={styles.nodeLabel} textAnchor="middle">
          Owner
        </text>

        {/* Peripheral nodes */}
        {nodes.map((node, i) => {
          const angle = i * angleStep;
          const x = centerX + radius * Math.cos(angle);
          const y = centerY + radius * Math.sin(angle);
          const isContract = node.type === "contract";

          return (
            <g key={i}>
              {/* Connection line */}
              <line
                x1={centerX}
                y1={centerY}
                x2={x}
                y2={y}
                className={styles.connection}
              />
              {/* Node */}
              <circle
                cx={x}
                cy={y}
                r="15"
                className={isContract ? styles.nodeContract : styles.nodeAgent}
              />
              <text
                x={x}
                y={y - 22}
                className={styles.nodeLabel}
                textAnchor="middle"
              >
                {node.label}
              </text>
              <text
                x={x}
                y={y + 28}
                className={styles.nodeAddress}
                textAnchor="middle"
              >
                {shortenAddress(node.address || "")}
              </text>
            </g>
          );
        })}
      </svg>
    );
  };

  // ============ Render ============
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <header className={styles.header}>
          <div>
            <p className={styles.kicker}>Protocol Verification</p>
            <h1 className={styles.title}>Pulse of Life Verification Dashboard</h1>
            <p className={styles.subtitle}>
              Live on-chain verification and replay visualization
            </p>
          </div>
          <div className={styles.controls}>
            <div className={styles.modeToggle}>
              <button
                className={mode === "testnet" ? styles.modeActive : styles.modeButton}
                onClick={() => setMode("testnet")}
              >
                Testnet
              </button>
              <button
                className={mode === "fork" ? styles.modeActive : styles.modeButton}
                onClick={() => setMode("fork")}
              >
                Fork
              </button>
              <button
                className={mode === "mainnet" ? styles.modeActive : styles.modeButton}
                onClick={() => setMode("mainnet")}
              >
                Mainnet
              </button>
            </div>
            <div className={styles.statusBar}>
              <span className={styles.muted}>Network: {config.label}</span>
              <span className={styles.muted}>
                Block: {currentBlock ? currentBlock.toString() : "—"}
              </span>
            </div>
          </div>
        </header>

        {error && (
          <div className={styles.errorBanner}>
            <span>⚠️ {error}</span>
          </div>
        )}

        {/* Replay Controls */}
        {replayLog && (
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Replay Mode</h2>
              <span className={styles.muted}>
                Event {replayIndex} / {replayTransactions.length}
              </span>
            </div>
            <div className={styles.replayControls}>
              <button
                className={styles.button}
                onClick={() => setIsPlaying(!isPlaying)}
              >
                {isPlaying ? "Pause" : "Play"}
              </button>
              <button
                className={styles.button}
                onClick={() => {
                  setReplayIndex(0);
                  setIsPlaying(false);
                }}
              >
                Reset
              </button>
              <input
                type="range"
                min="0"
                max={replayTransactions.length}
                value={replayIndex}
                onChange={(e) => setReplayIndex(parseInt(e.target.value))}
                className={styles.slider}
              />
            </div>
          </section>
        )}

        {/* Network Topology */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Network Topology</h2>
            <span className={styles.muted}>
              {replayLog ? "Replay data" : "Live state"}
            </span>
          </div>
          {renderTopology()}
        </section>

        {/* Metrics */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Metrics</h2>
          </div>
          <div className={styles.metricsGrid}>
            <div className={styles.metricCard}>
              <div className={styles.metricValue}>{metrics.totalPulses}</div>
              <div className={styles.metricLabel}>Total Pulses</div>
            </div>
            <div className={styles.metricCard}>
              <div className={styles.metricValue}>{metrics.activeWallets}</div>
              <div className={styles.metricLabel}>Active Wallets</div>
            </div>
            <div className={styles.metricCard}>
              <div className={styles.metricValue}>{metrics.avgGas}</div>
              <div className={styles.metricLabel}>Avg Gas</div>
            </div>
            <div className={styles.metricCard}>
              <div className={styles.metricValue}>
                {metrics.streakLeader?.streak || 0}
              </div>
              <div className={styles.metricLabel}>Top Streak</div>
            </div>
          </div>
        </section>

        {/* Transaction Feed */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Transaction Feed</h2>
            <span className={styles.muted}>Latest {visibleTransactions.length}</span>
          </div>
          <div className={styles.feedList}>
            <div className={styles.feedHeader}>
              <span>Tx Hash</span>
              <span>Function</span>
              <span>Status</span>
              <span>Gas</span>
              <span>Block</span>
            </div>
            {visibleTransactions.length === 0 ? (
              <div className={styles.feedEmpty}>No transactions yet</div>
            ) : (
              visibleTransactions.map((tx, i) => (
                <div className={styles.feedRow} key={`${tx.hash}-${i}`}>
                  <a
                    href={`${config.explorerBase}${tx.hash}`}
                    target="_blank"
                    rel="noreferrer"
                    className={styles.link}
                  >
                    {shortenAddress(tx.hash)}
                  </a>
                  <span className={styles.mono}>{tx.function}</span>
                  <span
                    className={
                      tx.status === "success" ? styles.statusSuccess : styles.statusFailed
                    }
                  >
                    {tx.status}
                  </span>
                  <span className={styles.muted}>{tx.gasUsed || "—"}</span>
                  <span className={styles.muted}>{tx.blockNumber || "—"}</span>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Spec Compliance */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Spec Compliance</h2>
            <span className={styles.muted}>
              {replayLog
                ? `${replayLog.summary.passed}/${replayLog.summary.total} passed`
                : "—"}
            </span>
          </div>
          <div className={styles.complianceList}>
            {replayPhases.length === 0 ? (
              <div className={styles.feedEmpty}>No phase data available</div>
            ) : (
              replayPhases.map((phase) => (
                <div
                  key={phase.phase}
                  className={`${styles.complianceRow} ${
                    phase.status === "pass"
                      ? styles.compliancePass
                      : phase.status === "fail"
                      ? styles.complianceFail
                      : styles.complianceSkip
                  }`}
                >
                  <span className={styles.phaseNumber}>Phase {phase.phase}</span>
                  <span className={styles.phaseName}>{phase.name}</span>
                  <span className={styles.phaseStatus}>{phase.status.toUpperCase()}</span>
                  <span className={styles.muted}>
                    {phase.checks.length} checks, {phase.transactions.length} txs
                  </span>
                </div>
              ))
            )}
          </div>
        </section>

        <footer className={styles.footer}>
          <p>
            Protocol verification dashboard for Pulse of Life. Data shown is for
            verification purposes only.
          </p>
        </footer>
      </main>
    </div>
  );
}
