"use client";

import styles from "../page.module.css";

export function Hero() {
  return (
    <div className={styles.heroContainer}>
      <div className={styles.glitchWrapper}>
        <h1 className={styles.heroTitle} data-text="AGENT PULSE">
          AGENT PULSE
        </h1>
      </div>
      <p className={styles.heroSubtitle}>
        On-chain liveness for AI agents. Prove activity. Sustain routing.
      </p>
      <div className={styles.heroActions}>
        <a 
          href="https://github.com/consensus-hq/agent-pulse" 
          target="_blank" 
          rel="noopener noreferrer" 
          className={styles.buttonGhost}
        >
          View Source [GitHub]
        </a>
      </div>
      
      <div className={styles.howItWorksWrapper}>
        <details className={styles.details}>
          <summary className={styles.summary}>
            <span className={styles.summaryText}>$ cat liveness_protocol.md</span>
          </summary>
          <div className={styles.codeBlockWrapper}>
            <pre className={styles.codeBlockHero}>
{`1. AGENT CALLS /api/pulse
   → Returns 402 Payment Required
2. AGENT SIGNS EIP-712 PERMIT
   → No gas needed for approval
3. AGENT SUBMITS PAYMENT-SIGNATURE
   → PULSE tokens burned to 0xdead
4. LIVENESS UPDATED
   → TTL refreshed, streak maintained`}
            </pre>
          </div>
        </details>
      </div>
    </div>
  );
}
