"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { createPublicClient, http, type Address, type PublicClient } from "viem";
import styles from "./verify.module.css";
import { useAnvilTimeControl } from "@/hooks/useAnvilTimeControl";

// ============ Types ============
type NetworkMode = "testnet" | "fork" | "mainnet";
type TimeStep = 1 | 6 | 24; // hours

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
  lastPulseAt: number;
  ttlRemaining?: number; // in seconds
}

interface NetworkConfig {
  rpcUrl: string;
  registryAddress: Address | null;
  tokenAddress: Address | null;
  explorerBase: string;
  label: string;
  logUrl: string | null;
}

interface AgentStatus {
  alive: boolean;
  lastPulseAt: bigint;
  streak: bigint;
  hazardScore: bigint;
}

// ============ Network Configurations ============
const getNetworkConfig = (mode: NetworkMode): NetworkConfig => {
  const chain = parseInt(process.env.NEXT_PUBLIC_CHAIN_ID || "8453", 10);

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
        rpcUrl:
          process.env.NEXT_PUBLIC_RPC_URL ||
          (chain === 8453 ? "https://mainnet.base.org" : "https://sepolia.base.org"),
        registryAddress: (process.env.NEXT_PUBLIC_PULSE_REGISTRY_ADDRESS as Address) || null,
        tokenAddress: (process.env.NEXT_PUBLIC_PULSE_TOKEN_ADDRESS as Address) || null,
        explorerBase:
          chain === 8453
            ? "https://basescan.org/tx/"
            : "https://sepolia.basescan.org/tx/",
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
    type: "function",
    name: "isAlive",
    stateMutability: "view",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
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

const formatDuration = (seconds: number): string => {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
};

const formatTimestamp = (timestamp: number): string => {
  return new Date(timestamp * 1000).toISOString().replace("T", " ").slice(0, 19);
};

// ============ Main Component ============
export default function VerifyPage() {
  const [mode, setMode] = useState<NetworkMode>("fork");
  const [replayLog, setReplayLog] = useState<VerificationLog | null>(null);
  const [replayIndex, setReplayIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentBlock, setCurrentBlock] = useState<bigint | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Time manipulation state
  const [isTimeMode, setIsTimeMode] = useState(false);
  const [timeStep, setTimeStep] = useState<TimeStep>(6); // hours
  const [sliderPosition, setSliderPosition] = useState(0); // in time steps
  const [baselineSnapshotId, setBaselineSnapshotId] = useState<string | null>(null);
  const [baselineTimestamp, setBaselineTimestamp] = useState<number | null>(null);
  const [currentTimestamp, setCurrentTimestamp] = useState<number | null>(null);
  const [agentStatuses, setAgentStatuses] = useState<Map<string, AgentStatus>>(new Map());

  const config = useMemo(() => getNetworkConfig(mode), [mode]);

  // Anvil time control hook
  const anvil = useAnvilTimeControl();

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

  // ============ Initialize Time Mode ============
  useEffect(() => {
    const initTimeMode = async () => {
      // Only enable time mode in fork mode when Anvil is available
      if (mode !== "fork" || !anvil.isAvailable || !replayLog) {
        setIsTimeMode(false);
        return;
      }

      // Check if registry address is configured
      if (!config.registryAddress) {
        setIsTimeMode(false);
        return;
      }

      try {
        // Take initial snapshot
        const snapshotId = await anvil.snapshot();
        setBaselineSnapshotId(snapshotId);

        // Get current block timestamp
        const block = await publicClient?.getBlock({ blockTag: "latest" });
        if (block?.timestamp) {
          const ts = Number(block.timestamp);
          setBaselineTimestamp(ts);
          setCurrentTimestamp(ts);
        }

        // Read initial agent statuses
        await readAgentStatuses();

        setIsTimeMode(true);
        setError(null);
      } catch (err) {
        console.error("Failed to initialize time mode:", err);
        setIsTimeMode(false);
        // Fall back to static replay mode
      }
    };

    if (mode === "fork" && anvil.isAvailable && replayLog && !baselineSnapshotId) {
      initTimeMode();
    }
  }, [mode, anvil.isAvailable, replayLog, config.registryAddress, baselineSnapshotId, publicClient]);

  // ============ Read Agent Statuses ============
  const readAgentStatuses = useCallback(async (): Promise<void> => {
    if (!publicClient || !config.registryAddress || !replayLog) return;

    const newStatuses = new Map<string, AgentStatus>();
    const agentAddresses = replayLog.wallets.users;

    for (const address of agentAddresses) {
      try {
        const status = await publicClient.readContract({
          address: config.registryAddress!,
          abi: REGISTRY_ABI,
          functionName: "getAgentStatus",
          args: [address],
        }) as [boolean, bigint, bigint, bigint];

        newStatuses.set(address.toLowerCase(), {
          alive: status[0],
          lastPulseAt: status[1],
          streak: status[2],
          hazardScore: status[3],
        });
      } catch (err) {
        console.error(`Failed to read status for ${address}:`, err);
      }
    }

    setAgentStatuses(newStatuses);
  }, [publicClient, config.registryAddress, replayLog]);

  // ============ Handle Slider Change ============
  const handleSliderChange = useCallback(async (newPosition: number) => {
    if (!isTimeMode || !baselineSnapshotId || baselineTimestamp === null) {
      // Static replay mode
      setReplayIndex(newPosition);
      return;
    }

    const maxPosition = (7 * 24) / timeStep; // 7 days in time steps
    const clampedPosition = Math.max(0, Math.min(newPosition, maxPosition));

    setSliderPosition(clampedPosition);

    try {
      const targetTimestamp = baselineTimestamp + (clampedPosition * timeStep * 3600);

      if (clampedPosition < sliderPosition) {
        // Moving backward: revert then advance to new position
        await anvil.revert(baselineSnapshotId);
        // Need to re-take snapshot after revert (revert consumes the snapshot)
        const newSnapshotId = await anvil.snapshot();
        setBaselineSnapshotId(newSnapshotId);
      }

      // Calculate delta from baseline
      const deltaSeconds = clampedPosition * timeStep * 3600;
      await anvil.advanceTime(deltaSeconds);

      setCurrentTimestamp(targetTimestamp);
      await readAgentStatuses();
      setError(null);
    } catch (err) {
      setError(`Time manipulation failed: ${err instanceof Error ? err.message : "Unknown"}`);
      // Don't update position on error
    }
  }, [isTimeMode, baselineSnapshotId, baselineTimestamp, timeStep, sliderPosition, anvil, readAgentStatuses]);

  // ============ Replay Controls ============
  useEffect(() => {
    if (!isPlaying || !replayLog) return;

    if (isTimeMode) {
      // In time mode, auto-advance slider
      const maxPosition = (7 * 24) / timeStep;
      if (sliderPosition >= maxPosition) {
        setIsPlaying(false);
        return;
      }

      const timer = setTimeout(() => {
        handleSliderChange(sliderPosition + 1);
      }, 1000);

      return () => clearTimeout(timer);
    } else {
      // Static replay mode
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
    }
  }, [isPlaying, replayLog, isTimeMode, sliderPosition, timeStep, replayIndex, handleSliderChange]);

  // ============ Reset Time Mode ============
  const resetTimeMode = useCallback(async () => {
    if (!isTimeMode || !baselineSnapshotId) return;

    try {
      await anvil.revert(baselineSnapshotId);
      const newSnapshotId = await anvil.snapshot();
      setBaselineSnapshotId(newSnapshotId);
      setSliderPosition(0);
      setCurrentTimestamp(baselineTimestamp);
      await readAgentStatuses();
    } catch (err) {
      setError(`Reset failed: ${err instanceof Error ? err.message : "Unknown"}`);
    }
  }, [isTimeMode, baselineSnapshotId, baselineTimestamp, anvil, readAgentStatuses]);

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

  // Get agent nodes with live status
  const agentNodes = useMemo((): AgentNode[] => {
    if (!replayLog) return [];

    return replayLog.wallets.users.map((address, i) => {
      const status = agentStatuses.get(address.toLowerCase());
      const now = currentTimestamp || Math.floor(Date.now() / 1000);
      const ttl = status ? Number(status.lastPulseAt) + 86400 - now : undefined; // Assuming 24h TTL

      return {
        address,
        label: `User ${i + 1}`,
        isAlive: status?.alive ?? false,
        streak: status ? Number(status.streak) : 0,
        hazard: status ? Number(status.hazardScore) : 0,
        lastPulseAt: status ? Number(status.lastPulseAt) : 0,
        ttlRemaining: ttl && ttl > 0 ? ttl : 0,
      };
    });
  }, [replayLog, agentStatuses, currentTimestamp]);

  const metrics = useMemo(() => {
    if (!replayLog) {
      return {
        totalPulses: 0,
        activeWallets: 0,
        avgGas: "—",
        streakLeader: null as AgentNode | null,
        aliveCount: 0,
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

    // Find streak leader from live data
    let streakLeader: AgentNode | null = null;
    for (const node of agentNodes) {
      if (!streakLeader || node.streak > streakLeader.streak) {
        streakLeader = node;
      }
    }

    const aliveCount = agentNodes.filter(n => n.isAlive).length;

    return { totalPulses, activeWallets, avgGas, streakLeader, aliveCount };
  }, [replayLog, replayTransactions, replayIndex, agentNodes]);

  // Calculate time display
  const timeDisplay = useMemo(() => {
    if (!isTimeMode || baselineTimestamp === null) return null;

    const hoursElapsed = sliderPosition * timeStep;
    const relativeTime = hoursElapsed === 0 ? "T+0h" : `T+${hoursElapsed}h`;
    const absoluteTime = formatTimestamp(currentTimestamp || baselineTimestamp);

    return { relativeTime, absoluteTime, hoursElapsed };
  }, [isTimeMode, baselineTimestamp, sliderPosition, timeStep, currentTimestamp]);

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
      { label: "Registry", address: contracts.pulseRegistry, type: "contract" as const },
      { label: "Token", address: contracts.pulseToken, type: "contract" as const },
      ...wallets.users.map((addr, i) => ({
        label: `User ${i + 1}`,
        address: addr,
        type: "agent" as const,
        index: i,
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

          // Get agent status for agent nodes
          let nodeClassName = isContract ? styles.nodeContract : styles.nodeAgent;
          let ttlText = "";

          if (!isContract && "index" in node) {
            const agentNode = agentNodes[node.index];
            if (agentNode) {
              if (!agentNode.isAlive) {
                nodeClassName = styles.nodeAgentDead;
              } else if (agentNode.ttlRemaining && agentNode.ttlRemaining < 7200) {
                // Less than 2 hours remaining
                nodeClassName = styles.nodeAgentExpiring;
              } else {
                nodeClassName = styles.nodeAgentAlive;
              }
              if (agentNode.ttlRemaining !== undefined) {
                ttlText = agentNode.isAlive ? `TTL: ${formatDuration(agentNode.ttlRemaining)}` : "DEAD";
              }
            }
          }

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
                className={nodeClassName}
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
              {/* TTL indicator for agents */}
              {!isContract && ttlText && (
                <text
                  x={x}
                  y={y + 38}
                  className={styles.nodeAddress}
                  textAnchor="middle"
                  style={{ fontSize: "8px", fill: ttlText === "DEAD" ? "#f87171" : "#6b8f6b" }}
                >
                  {ttlText}
                </text>
              )}
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
              {isTimeMode && (
                <span className={`${styles.timeModeBadge} ${!anvil.isAvailable ? styles.timeModeDisabled : ""}`}>
                  Time Control Active
                </span>
              )}
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
              <h2 className={styles.sectionTitle}>
                {isTimeMode ? "Time Manipulation Mode" : "Replay Mode"}
              </h2>
              <span className={styles.muted}>
                {isTimeMode
                  ? `Step: ${sliderPosition} / ${(7 * 24) / timeStep} (${timeStep}h increments)`
                  : `Event ${replayIndex} / ${replayTransactions.length}`}
              </span>
            </div>

            {/* Time Display */}
            {isTimeMode && timeDisplay && (
              <div className={styles.timeDisplay}>
                <span className={styles.timeDisplayLabel}>Simulated Time</span>
                <span className={styles.timeDisplayValue}>{timeDisplay.absoluteTime}</span>
                <span className={styles.timeDisplayRelative}>{timeDisplay.relativeTime}</span>
              </div>
            )}

            {/* Time Step Controls (only in time mode) */}
            {isTimeMode && (
              <div className={styles.timeStepControls}>
                <span className={styles.timeStepLabel}>Time Step:</span>
                {[1, 6, 24].map((step) => (
                  <button
                    key={step}
                    className={`${styles.timeStepButton} ${timeStep === step ? styles.timeStepActive : ""}`}
                    onClick={() => setTimeStep(step as TimeStep)}
                  >
                    {step}h
                  </button>
                ))}
              </div>
            )}

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
                  if (isTimeMode) {
                    resetTimeMode();
                  } else {
                    setReplayIndex(0);
                  }
                  setIsPlaying(false);
                }}
              >
                Reset
              </button>
              <input
                type="range"
                min="0"
                max={isTimeMode ? (7 * 24) / timeStep : replayTransactions.length}
                value={isTimeMode ? sliderPosition : replayIndex}
                onChange={(e) => {
                  const value = parseInt(e.target.value);
                  if (isTimeMode) {
                    handleSliderChange(value);
                  } else {
                    setReplayIndex(value);
                  }
                }}
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
              {replayLog ? (isTimeMode ? "Live state" : "Replay data") : "Live state"}
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
            {isTimeMode && (
              <div className={styles.metricCard}>
                <div className={styles.metricValue} style={{ color: "var(--accent)" }}>
                  {metrics.aliveCount}
                </div>
                <div className={styles.metricLabel}>Alive Agents</div>
              </div>
            )}
          </div>
        </section>

        {/* Agent Status List (only in time mode) */}
        {isTimeMode && agentNodes.length > 0 && (
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Agent Status</h2>
              <span className={styles.muted}>Live from contract</span>
            </div>
            <div className={styles.feedList}>
              <div className={styles.feedHeader}>
                <span>Agent</span>
                <span>Status</span>
                <span>Streak</span>
                <span>Hazard</span>
                <span>TTL Remaining</span>
              </div>
              {agentNodes.map((node, i) => (
                <div className={styles.feedRow} key={node.address}>
                  <span className={styles.mono}>{shortenAddress(node.address)}</span>
                  <span className={node.isAlive ? styles.statusSuccess : styles.statusFailed}>
                    {node.isAlive ? "Alive" : "Expired"}
                  </span>
                  <span>{node.streak}</span>
                  <span>{node.hazard}</span>
                  <span className={
                    node.ttlRemaining && node.ttlRemaining < 7200 && node.isAlive
                      ? styles.statusFailed
                      : styles.muted
                  }>
                    {node.isAlive && node.ttlRemaining !== undefined
                      ? formatDuration(node.ttlRemaining)
                      : "—"}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

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
