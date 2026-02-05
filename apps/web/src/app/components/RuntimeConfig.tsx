"use client";

import styles from "../page.module.css";

interface RuntimeConfigProps {
  configSnapshot: Record<string, string>;
}

export function RuntimeConfig({ configSnapshot }: RuntimeConfigProps) {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>Runtime config</h2>
        <span className={styles.muted}>Env snapshot (public)</span>
      </div>
      <pre className={styles.output}>
        {JSON.stringify(configSnapshot, null, 2)}
      </pre>
    </section>
  );
}
