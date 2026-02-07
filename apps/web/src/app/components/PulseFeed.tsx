"use client";

import { useEffect, useState } from "react";
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
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => {
      setIsRefreshing(true);
      onRefresh();
      setTimeout(() => setIsRefreshing(false), 1000);
    }, 15000);
    return () => window.clearInterval(id);
  }, [onRefresh]);

  const feedRows = (feedData?.data ?? feedData?.recentPulses)?.slice(0, 10) ?? [];

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
            const txHash = pulse.transactionHash ?? pulse.txHash ?? "";
            const txUrl = explorerTxBaseUrl && txHash ? `${explorerTxBaseUrl}${txHash}` : "";
            
            return (
              <div 
                className={styles.feedRow} 
                key={`${pulse.agent}-${index}`}
                style={{
                  animation: index === 0 ? 'pulseGlow 2s ease-out' : 'none'
                }}
              >
                <span className={styles.mono} title={pulse.agent}>
                  {pulse.agent.slice(0, 8)}...{pulse.agent.slice(-6)}
                </span>
                <span style={{ color: 'var(--accent-bright)', fontWeight: 600 }}>
                  {pulse.amount}
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
      
      <style jsx>{`
        @keyframes pulseGlow {
          0% { background: rgba(74, 222, 128, 0.2); }
          100% { background: transparent; }
        }
      `}</style>
    </section>
  );
}
