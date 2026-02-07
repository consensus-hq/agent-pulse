"use client";

import { useEffect } from "react";
import { PulseFeedResponse } from "../lib/types";
import { formatMs, formatUnix, shortenHash } from "../lib/format";
import styles from "../page.module.css";

interface PulseFeedProps {
  feedData: PulseFeedResponse | null;
  feedError: string;
  feedLoading: boolean;
  feedCacheAge: number | null;
  explorerTxBaseUrl: string;
  onRefresh: () => void;
}

/** Format wei string to human-readable PULSE amount */
function formatPulseAmount(weiStr: string): string {
  try {
    const wei = BigInt(weiStr);
    const whole = wei / BigInt(10 ** 18);
    return `${whole.toLocaleString()} PULSE`;
  } catch {
    return weiStr;
  }
}

/** Format address for display */
function shortenAddress(addr: string): string {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/** Format timestamp to relative time */
function timeAgo(unixSeconds: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - unixSeconds;
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function PulseFeed({
  feedData,
  feedError,
  feedLoading,
  feedCacheAge,
  explorerTxBaseUrl,
  onRefresh,
}: PulseFeedProps) {
  useEffect(() => {
    const id = window.setInterval(() => {
      void onRefresh();
    }, 15000);
    return () => window.clearInterval(id);
  }, [onRefresh]);

  // API returns .data array, legacy type expected .recentPulses
  const feedRows = (feedData?.data ?? feedData?.recentPulses)?.slice(0, 12) ?? [];
  const totalEvents = feedData?.pagination?.totalEvents ?? feedRows.length;

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>Pulse feed</h2>
        <span className={styles.muted}>
          {totalEvents > 0 ? `${totalEvents} pulses` : ""} 
          {feedData?.updatedAt ? ` · Updated ${formatMs(feedData.updatedAt)}` : ""}
        </span>
      </div>
      {feedError ? <p className={styles.error}>{feedError}</p> : null}
      <div className={styles.feedList}>
        {feedLoading ? (
          <div className={styles.feedLoadingOverlay}>
            <p className={styles.muted}>Loading…</p>
          </div>
        ) : null}
        <div className={styles.feedHeader}>
          <span>Agent</span>
          <span>Amount</span>
          <span>Streak</span>
          <span>When</span>
          <span>Tx</span>
        </div>
        {!feedLoading && feedRows.length === 0 ? (
          <div className={styles.feedRow}>
            <span className={styles.muted}>No pulses yet.</span>
            <span className={styles.muted}>—</span>
            <span className={styles.muted}>—</span>
            <span className={styles.muted}>—</span>
            <span className={styles.muted}>—</span>
          </div>
        ) : (
          feedRows.map((pulse, index) => {
            // API returns transactionHash, legacy expected txHash
            const txHash = pulse.transactionHash ?? pulse.txHash ?? "";
            const txUrl = explorerTxBaseUrl && txHash
              ? `${explorerTxBaseUrl}${txHash}`
              : "";
            return (
              <div className={styles.feedRow} key={`${pulse.agent}-${index}`}>
                <span className={styles.mono}>{shortenAddress(pulse.agent)}</span>
                <span>{formatPulseAmount(pulse.amount)}</span>
                <span>{pulse.streak > 0 ? `🔥 ${pulse.streak}` : "—"}</span>
                <span title={formatUnix(pulse.timestamp)}>{timeAgo(pulse.timestamp)}</span>
                {txUrl ? (
                  <a className={styles.link} href={txUrl} target="_blank" rel="noreferrer">
                    {shortenHash(txHash)}
                  </a>
                ) : (
                  <span className={styles.muted}>—</span>
                )}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
