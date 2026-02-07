"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { formatUnits } from "viem";
import styles from "../page.module.css";
import { publicEnv } from "../lib/env.public";
import { useAddToken } from "../hooks/useAddToken";
import { useAgentStatus } from "../hooks/useAgentStatus";
import { usePulse } from "../hooks/usePulse";
import { useWallet } from "../hooks/useWallet";

const shortenAddress = (address?: string) => {
  if (!address) return "—";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
};

const formatTokenAmount = (value: bigint, decimals: number) => {
  if (!value) return "0";
  const formatted = formatUnits(value, decimals);
  const [whole, fraction] = formatted.split(".");
  const trimmed = fraction?.slice(0, 4).replace(/0+$/, "") || "";
  return trimmed ? `${whole}.${trimmed}` : whole;
};

const formatUnix = (seconds?: number | null) => {
  if (!seconds) return "NEVER";
  const date = new Date(seconds * 1000);
  return date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export default function WalletPanel() {
  const { address, isConnected, isConnecting } = useWallet();
  const {
    status,
    error,
    approvalMethod,
    approve,
    sendPulseAuto,
    allowance,
    balance,
    minPulseAmount,
    decimals,
    symbol,
    needsApproval,
    isReady,
    isPending,
    allowanceLoading,
    balanceLoading,
  } = usePulse();
  
  const agentStatus = useAgentStatus(address);
  const { addToken, added: tokenAdded } = useAddToken();

  const canPulse = isReady && minPulseAmount > 0n && !isPending;

  const pulseSignalLabel = agentStatus.loading
    ? "LOADING"
    : agentStatus.isAlive
    ? "ACTIVE"
    : "INACTIVE";

  return (
    <div className={styles.walletPanel}>
      <div className={styles.walletHeader} style={{ marginBottom: '1rem' }}>
        <div className={styles.tag}>Network Node</div>
        <ConnectButton showBalance={false} chainStatus="none" />
      </div>

      {!isConnected ? (
        <div className={styles.walletStats} style={{ borderStyle: 'dashed', opacity: 0.7 }}>
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '1rem' }}>
            <p className={styles.muted}>AUTHENTICATION REQUIRED</p>
            <p className={styles.dim} style={{ fontSize: '11px', marginTop: '4px' }}>
              Connect wallet to broadcast liveness pulse
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className={styles.walletStats}>
            <div>
              <p className={styles.walletLabel}>Identity</p>
              <p className={styles.walletValue} style={{ color: 'var(--accent)' }}>{shortenAddress(address)}</p>
            </div>
            <div>
              <p className={styles.walletLabel}>Liveness</p>
              <p className={`${styles.walletValue} ${agentStatus.isAlive ? styles.successText : styles.muted}`}>
                {pulseSignalLabel}
              </p>
            </div>
            <div>
              <p className={styles.walletLabel}>Balance</p>
              <p className={styles.walletValue}>
                {balanceLoading ? "..." : `${formatTokenAmount(balance, decimals)} ${symbol}`}
              </p>
            </div>
            <div>
              <p className={styles.walletLabel}>Streak</p>
              <p className={styles.walletValue}>{agentStatus.streak ?? 0} days</p>
            </div>
          </div>

          <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <button
              className={styles.button}
              style={{ width: '100%', padding: '14px', fontSize: '14px' }}
              onClick={() => void sendPulseAuto()}
              disabled={!canPulse}
            >
              {isPending ? <span className={styles.spinner} /> : (needsApproval ? "Sign & Broadcast Pulse" : "Broadcast Pulse")}
            </button>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className={styles.muted} style={{ fontSize: '10px' }}>
                COST: {formatTokenAmount(minPulseAmount, decimals)} {symbol}
              </span>
              <button
                className={styles.link}
                style={{ fontSize: '10px', background: 'none', border: 'none', cursor: 'pointer' }}
                onClick={() => void addToken()}
                disabled={tokenAdded}
              >
                {tokenAdded ? "✓ IN WALLET" : "+ ADD TO WALLET"}
              </button>
            </div>
          </div>

          {status && status !== "confirmed" && (
            <div className={styles.statusRow} style={{ marginTop: '12px', padding: '8px', background: 'rgba(0,0,0,0.2)', borderRadius: '4px' }}>
               <span className={styles.spinner} />
               <span className={styles.muted} style={{ fontSize: '11px', textTransform: 'uppercase' }}>
                 {status === "signing" ? "Requesting Signature..." : "Broadcasting Pulse..."}
               </span>
            </div>
          )}
          
          {error && <p className={styles.error} style={{ marginTop: '8px' }}>!! {error}</p>}
        </>
      )}
    </div>
  );
}
