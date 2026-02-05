"use client";

import { StatusResponse } from "../lib/types";
import { formatMs, formatUnix } from "../lib/format";
import styles from "../page.module.css";

interface PageHeaderProps {
  networkLabel: string;
  chainIdLabel: string;
  feedCacheHeader: string;
  feedCacheAge: number | null;
  lastRunStatus: string;
  lastRunTime: string;
}

export function PageHeader({
  networkLabel,
  chainIdLabel,
  feedCacheHeader,
  feedCacheAge,
  lastRunStatus,
  lastRunTime,
}: PageHeaderProps) {
  return (
    <header className={styles.header}>
      <div>
        <p className={styles.kicker}>Agent Pulse debug console</p>
        <h1 className={styles.title}>Routing eligibility console</h1>
        <p className={styles.subtitle}>
          Base chain routing gate. Pulse = paid eligibility refresh.
          No pulse → no routing.
        </p>
      </div>
      <div className={styles.statusBar}>
        <span className={styles.tag}>Live feed</span>
        <span className={styles.muted}>
          Network: {networkLabel} (chain {chainIdLabel || "—"})
        </span>
        <span className={styles.muted}>
          Cache: {feedCacheHeader || "—"}
        </span>
        <span className={styles.muted}>
          Feed age: {feedCacheAge !== null ? `${feedCacheAge}s` : "—"}
        </span>
        <span className={styles.muted}>
          Last run: {lastRunStatus} @ {lastRunTime}
        </span>
      </div>
    </header>
  );
}
