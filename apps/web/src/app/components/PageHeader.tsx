"use client";

import styles from "../page.module.css";

interface PageHeaderProps {
  networkLabel: string;
  chainIdLabel: string;
  feedCacheHeader: string;
  feedCacheAge: number | null;
  lastRunStatus: string;
  lastRunTime: string;
  totalAgents?: number;
  latestPulseTime?: string;
}

export function PageHeader({
  networkLabel,
  chainIdLabel,
  feedCacheAge,
  totalAgents,
  latestPulseTime,
}: PageHeaderProps) {
  return (
    <header className={styles.header}>
      <div>
        <p className={styles.kicker}>Agent Pulse</p>
        <h1 className={styles.title}>Liveness protocol</h1>
        <p className={styles.subtitle}>
          On-chain heartbeat for AI agents on Base.
          Pulse to stay routable. No pulse → no routing.
        </p>
      </div>
      <div className={styles.statusBar}>
        <span className={styles.tag}>Live</span>
        <span className={styles.muted}>
          Network: {networkLabel} (chain {chainIdLabel || "—"})
        </span>
        {totalAgents !== undefined && totalAgents > 0 && (
          <span className={styles.muted}>
            Agents: {totalAgents}
          </span>
        )}
        <span className={styles.muted}>
          Feed: {feedCacheAge !== null ? `${feedCacheAge}s ago` : "loading…"}
        </span>
        {latestPulseTime && (
          <span className={styles.muted}>
            Latest pulse: {latestPulseTime}
          </span>
        )}
      </div>
    </header>
  );
}
