"use client";

import { useEffect, useCallback } from "react";
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

  const feedRows = feedData?.recentPulses?.slice(0, 8) ?? [];

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>Pulse feed</h2>
        <span className={styles.muted}>
          Updated: {formatMs(feedData?.updatedAt)} | TTL: {" "}
          {feedData?.cache?.ttlSeconds
            ? `${feedData.cache.ttlSeconds}s`
            : "—"}
        </span>
      </div>
      {feedLoading ? <p className={styles.muted}>Loading…</p> : null}
      {feedError ? <p className={styles.error}>{feedError}</p> : null}
      <div className={styles.feedList}>
        <div className={styles.feedHeader}>
          <span>Agent</span>
          <span>Amount</span>
          <span>Streak</span>
          <span>Timestamp</span>
          <span>Tx</span>
        </div>
        {feedRows.length === 0 ? (
          <div className={styles.feedRow}>
            <span className={styles.muted}>No pulses yet.</span>
            <span className={styles.muted}>—</span>
            <span className={styles.muted}>—</span>
            <span className={styles.muted}>—</span>
            <span className={styles.muted}>—</span>
          </div>
        ) : (
          feedRows.map((pulse, index) => {
            const txHash = pulse.txHash ?? "";
            const txUrl = explorerTxBaseUrl && txHash
              ? `${explorerTxBaseUrl}${txHash}`
              : "";
            return (
              <div className={styles.feedRow} key={`${pulse.agent}-${index}`}>
                <span className={styles.mono}>{pulse.agent}</span>
                <span>{pulse.amount}</span>
                <span>{pulse.streak}</span>
                <span>{formatUnix(pulse.timestamp)}</span>
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
