"use client";

import { useEffect, useState } from "react";
import { formatUnits } from "viem";
import { PulseFeedResponse } from "../lib/types";
import { formatMs, formatUnix, shortenHash } from "../lib/format";
import styles from "../page.module.css";

/**
 * FIX: Safely format a wei-string amount via BigInt.
 * If the amount is missing, empty, or non-numeric, return the raw string
 * instead of throwing — a single bad record was crashing the entire
 * feed component (React error boundary → blank section).
 *
 * NOTE: This file is also modified in PR #153. If both merge, keep
 * the safeFormatAmount helper + Array.isArray guard — they are equivalent.
 */
function safeFormatAmount(amount: string | undefined): string {
  if (!amount) return "0";
  try {
    return formatUnits(BigInt(amount), 18);
  } catch {
    // Malformed amount string — show raw value rather than crash
    return amount;
  }
}

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
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => {
      setIsRefreshing(true);
      onRefresh();
      setTimeout(() => setIsRefreshing(false), 1000);
    }, 15000);
    return () => window.clearInterval(id);
  }, [onRefresh]);

  // FIX: Guard against non-array data shapes — if the API returns an object
  // or null for .data, the old ?.slice() would throw and blank the component.
  const rawRows = Array.isArray(feedData?.data)
    ? feedData.data
    : Array.isArray(feedData?.recentPulses)
      ? feedData.recentPulses
      : [];
  const feedRows = rawRows.slice(0, 10);

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <h2 className={styles.sectionTitle}>Pulse stream</h2>
          {isRefreshing && <span className={styles.spinner} />}
        </div>
        <span className={styles.muted}>
          {formatMs(feedData?.updatedAt)} | TTL: {feedData?.cache?.ttlSeconds ? `${feedData.cache.ttlSeconds}s` : "—"}
        </span>
      </div>
      
      {feedError && <div className={styles.error}>{feedError}</div>}
      
      <div className={styles.feedList}>
        <div className={styles.feedHeader}>
          <span>Agent Node</span>
          <span>Amount</span>
          <span>Streak</span>
          <span>Timestamp</span>
          <span>Receipt</span>
        </div>
        
        {feedLoading && feedRows.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center' }}>
            <span className={styles.spinner} />
            <p className={styles.muted} style={{ marginTop: '1rem' }}>Listening for pulses...</p>
          </div>
        ) : feedRows.length === 0 ? (
          <div className={styles.feedRow} style={{ gridTemplateColumns: '1fr', textAlign: 'center' }}>
            <span className={styles.muted}>No pulses detected on network.</span>
          </div>
        ) : (
          feedRows.map((pulse, index) => {
            // FIX: Defend against missing/non-string agent field
            const agent = typeof pulse.agent === "string" ? pulse.agent : "";
            const txHash = pulse.transactionHash ?? pulse.txHash ?? "";
            // FIX: trim explorerTxBaseUrl in case env had trailing whitespace
            const txBase = explorerTxBaseUrl.trim();
            const txUrl = txBase && txHash ? `${txBase}${txHash}` : "";
            
            return (
              <div 
                key={`${agent || "unknown"}-${index}`}
                className={`${styles.feedRow} ${index === 0 ? styles.pulseGlow : ''}`}
              >
                <span className={styles.mono} title={agent || undefined}>
                  {agent ? `${agent.slice(0, 8)}...${agent.slice(-6)}` : "—"}
                </span>
                <span style={{ color: 'var(--accent-bright)', fontWeight: 600 }}>
                  {safeFormatAmount(pulse.amount)}
                </span>
                <span style={{ color: 'var(--warning)' }}>
                  {pulse.streak}🔥
                </span>
                <span className={styles.muted}>
                  {formatUnix(pulse.timestamp)}
                </span>
                {txUrl ? (
                  <a className={styles.link} href={txUrl} target="_blank" rel="noreferrer">
                    {shortenHash(txHash)} ↗
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
