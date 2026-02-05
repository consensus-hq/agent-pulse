"use client";

import styles from "../page.module.css";

interface RoutingSyncProps {
  isAlive: boolean;
}

export function RoutingSync({ isAlive }: RoutingSyncProps) {
  const reputationCooldown = isAlive ? "Rate limit: 10m (placeholder)" : "";

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>Routing sync</h2>
        <span className={styles.muted}>
          {isAlive ? "Eligible" : "Locked (requires alive status)"}
        </span>
      </div>
      <div className={styles.row}>
        <button
          className={styles.button}
          type="button"
          disabled={!isAlive}
        >
          Sync routing signal
        </button>
        <span className={styles.muted}>
          {isAlive
            ? "Sync enabled for alive wallets."
            : "Run status query to unlock."}
        </span>
        {isAlive ? (
          <span className={styles.muted}>{reputationCooldown}</span>
        ) : null}
      </div>
      <p className={styles.muted}>
        Router-only signal. This does not claim identity, quality, or AI.
      </p>
    </section>
  );
}
