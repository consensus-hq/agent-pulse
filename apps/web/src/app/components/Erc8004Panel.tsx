"use client";

import { useErc8004 } from "../hooks/useErc8004";
import { publicEnv } from "../lib/env.public";
import styles from "../page.module.css";

interface Erc8004PanelProps {
  address: string | undefined | null;
  showPulseEligibility?: boolean;
}

function shortenAddress(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function LoadingDot() {
  return <span className={styles.loadingDot}>●</span>;
}

export function Erc8004Panel({
  address,
  showPulseEligibility = true,
}: Erc8004PanelProps) {
  const {
    identity,
    reputation,
    isLoading,
    identityError,
    reputationError,
    pulseEligible,
  } = useErc8004(address, { enabled: Boolean(address) });

  const registerUrl = publicEnv.erc8004RegisterUrl || "#";

  // Loading state
  if (isLoading) {
    return (
      <div className={styles.erc8004Panel}>
        <div className={styles.panelHeader}>
          <span className={styles.panelTitle}>Identity &amp; Reputation</span>
          <LoadingDot />
        </div>
        <div className={styles.panelContent}>
          <p className={styles.muted}>Querying on-chain data…</p>
        </div>
      </div>
    );
  }

  // No address state
  if (!address) {
    return (
      <div className={styles.erc8004Panel}>
        <div className={styles.panelHeader}>
          <span className={styles.panelTitle}>Identity &amp; Reputation</span>
        </div>
        <div className={styles.panelContent}>
          <p className={styles.muted}>Enter an address to query ERC-8004 data.</p>
        </div>
      </div>
    );
  }

  // Error state
  const hasError = identityError || reputationError;

  return (
    <div className={styles.erc8004Panel}>
      <div className={styles.panelHeader}>
        <span className={styles.panelTitle}>Identity &amp; Reputation</span>
        <span className={styles.muted}>{shortenAddress(address)}</span>
      </div>

      <div className={styles.panelContent}>
        {/* Identity Section */}
        <div className={styles.panelSection}>
          <div className={styles.sectionLabel}>ERC-8004 Identity</div>
          
          {identity?.error ? (
            <div className={styles.panelRow}>
              <span className={styles.errorIndicator}>⚠</span>
              <span className={styles.errorText}>Query failed: {identity.error}</span>
            </div>
          ) : identity?.isRegistered ? (
            <>
              <div className={styles.panelRow}>
                <span className={styles.successIndicator}>✓</span>
                <span className={styles.successText}>Registered</span>
              </div>
              {identity.agentId !== undefined && (
                <div className={styles.panelRow}>
                  <span className={styles.label}>Agent ID:</span>
                  <span className={styles.value}>#{identity.agentId.toString()}</span>
                </div>
              )}
              {identity.agentWallet && (
                <div className={styles.panelRow}>
                  <span className={styles.label}>Wallet:</span>
                  <span className={styles.value}>{shortenAddress(identity.agentWallet)}</span>
                </div>
              )}
              {identity.tokenURI && (
                <div className={styles.panelRow}>
                  <span className={styles.label}>Metadata:</span>
                  <a
                    href={identity.tokenURI.startsWith("data:") ? "#" : identity.tokenURI}
                    className={styles.link}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => {
                      if (identity.tokenURI?.startsWith("data:")) {
                        e.preventDefault();
                        // Show the data URI content in a more readable way if possible
                        alert("Token metadata is embedded as data URI");
                      }
                    }}
                  >
                    {identity.tokenURI.startsWith("data:") ? "(embedded)" : "View"}
                  </a>
                </div>
              )}
            </>
          ) : (
            <>
              <div className={styles.panelRow}>
                <span className={styles.mutedIndicator}>○</span>
                <span className={styles.muted}>Not registered</span>
              </div>
              <div className={styles.panelRow}>
                <a
                  href={registerUrl}
                  className={styles.link}
                  target="_blank"
                  rel="noreferrer"
                >
                  Register agent →
                </a>
              </div>
            </>
          )}
        </div>

        {/* Reputation Section */}
        <div className={styles.panelSection}>
          <div className={styles.sectionLabel}>ERC-8004 Reputation</div>
          
          {reputation?.error ? (
            <div className={styles.panelRow}>
              <span className={styles.errorIndicator}>⚠</span>
              <span className={styles.errorText}>Query failed: {reputation.error}</span>
            </div>
          ) : reputation?.hasReputation ? (
            <>
              <div className={styles.panelRow}>
                <span className={styles.successIndicator}>✓</span>
                <span className={styles.successText}>Has reputation data</span>
              </div>
              <div className={styles.panelRow}>
                <span className={styles.label}>Feedback entries:</span>
                <span className={styles.value}>{reputation.feedbackCount.toString()}</span>
              </div>
              {reputation.formattedScore !== undefined && (
                <div className={styles.panelRow}>
                  <span className={styles.label}>Score:</span>
                  <span className={styles.value}>{reputation.formattedScore}</span>
                </div>
              )}
            </>
          ) : identity?.isRegistered ? (
            <div className={styles.panelRow}>
              <span className={styles.mutedIndicator}>○</span>
              <span className={styles.muted}>No reputation data yet</span>
            </div>
          ) : (
            <div className={styles.panelRow}>
              <span className={styles.muted}>Register identity to receive reputation</span>
            </div>
          )}
        </div>

        {/* Pulse Eligibility */}
        {showPulseEligibility && (
          <div className={styles.panelSection}>
            <div className={styles.sectionLabel}>Pulse Eligibility</div>
            <div className={styles.panelRow}>
              {pulseEligible ? (
                <>
                  <span className={styles.successIndicator}>✓</span>
                  <span className={styles.successText}>Eligible for pulse routing</span>
                </>
              ) : (
                <>
                  <span className={styles.mutedIndicator}>○</span>
                  <span className={styles.muted}>Register identity to enable pulses</span>
                </>
              )}
            </div>
          </div>
        )}

        {/* Global Error */}
        {hasError && !identity?.error && !reputation?.error && (
          <div className={styles.panelSection}>
            <div className={styles.panelRow}>
              <span className={styles.errorIndicator}>⚠</span>
              <span className={styles.errorText}>{identityError || reputationError}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Erc8004Panel;
