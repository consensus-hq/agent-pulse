"use client";

import styles from "../page.module.css";
import { useWallet } from "../hooks/useWallet";
import { useAgentStatus } from "../hooks/useAgentStatus";

export function RoutingSync() {
  const { address } = useWallet();
  const status = useAgentStatus(address as `0x${string}` | undefined);

  // Treat "unknown" (null) as locked — we don't have chain data.
  const isAlive = status.isAlive === true;
  const reputationCooldown = isAlive ? "Rate limit: 10m (placeholder)" : "";

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>Routing sync</h2>
        <span className={styles.muted}>
          {status.isAlive === null
            ? "Unknown (RPC)"
            : isAlive
              ? "Eligible"
              : "Locked (requires alive status)"}
        </span>
      </div>
      <div className={styles.row}>
        <button className={styles.button} type="button" disabled={!isAlive}>
          Sync routing signal
        </button>
        <span className={styles.muted}>
          {isAlive
            ? "Enabled for alive wallets."
            : "Broadcast a pulse to become eligible."}
        </span>
        {isAlive ? <span className={styles.muted}>{reputationCooldown}</span> : null}
      </div>
      <p className={styles.muted}>
        Router-only signal. This does not claim identity, quality, or AI.
      </p>
    </section>
  );
}
