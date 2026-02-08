"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { formatUnits } from "viem";
import { useState, useCallback } from "react";
import styles from "../page.module.css";
import { publicEnv } from "../lib/env.public";
import { useAddToken } from "../hooks/useAddToken";
import { useAgentStatus } from "../hooks/useAgentStatus";
import { usePulse } from "../hooks/usePulse";
import { useWallet } from "../hooks/useWallet";

const SWAP_PAGE_URL = "/defi";


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

function GetPulseSection({ address }: { address: string }) {
  const [claiming, setClaiming] = useState(false);
  const [claimResult, setClaimResult] = useState<{ success: boolean; message: string } | null>(null);

  const claimFaucet = useCallback(async () => {
    setClaiming(true);
    setClaimResult(null);
    try {
      const res = await fetch("/api/faucet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      });
      const data = await res.json();
      if (data.success) {
        setClaimResult({ success: true, message: `Claimed ${data.amount} PULSE — refresh in a few seconds` });
      } else {
        setClaimResult({ success: false, message: data.error || "Claim failed" });
      }
    } catch {
      setClaimResult({ success: false, message: "Network error" });
    } finally {
      setClaiming(false);
    }
  }, [address]);

  return (
    <div
      style={{
        marginTop: "12px",
        padding: "16px",
        background: "rgba(34, 197, 94, 0.04)",
        border: "1px dashed var(--accent)",
        borderRadius: "4px",
      }}
    >
      <p style={{ margin: "0 0 8px", fontSize: "11px", color: "var(--accent)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px" }}>
        ⚡ Get PULSE to start pulsing
      </p>
      <p style={{ margin: "0 0 12px", fontSize: "11px", color: "var(--muted)", lineHeight: 1.5 }}>
        You need PULSE tokens to broadcast liveness signals. Get some to get started:
      </p>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        <a
          href={SWAP_PAGE_URL}
          className={styles.button}
          style={{
            flex: 1,
            minWidth: "140px",
            padding: "10px 16px",
            fontSize: "12px",
            textAlign: "center",
            textDecoration: "none",
            display: "inline-block",
          }}
        >
          Swap ETH → PULSE
        </a>
        <button
          className={styles.button}
          style={{
            flex: 1,
            minWidth: "140px",
            padding: "10px 16px",
            fontSize: "12px",
            background: "transparent",
            border: "1px solid var(--accent)",
            color: "var(--accent)",
          }}
          onClick={() => void claimFaucet()}
          disabled={claiming}
        >
          {claiming ? "Claiming..." : "Claim 10K Free (Faucet)"}
        </button>
      </div>
      {claimResult && (
        <p style={{
          margin: "8px 0 0",
          fontSize: "11px",
          color: claimResult.success ? "var(--accent)" : "var(--error, #ef4444)",
        }}>
          {claimResult.success ? "✓" : "!!"} {claimResult.message}
        </p>
      )}
    </div>
  );
}

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
    ? "CHECKING…"
    : agentStatus.isAlive === null
    ? (agentStatus.hasData === false ? "UNKNOWN" : "CHECKING…")
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

          {/* Get PULSE onramp — shown when balance is insufficient */}
          {isConnected && !balanceLoading && balance < minPulseAmount && address && (
            <GetPulseSection address={address} />
          )}

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

          {(status === "signing" || status === "approving" || status === "approved" || status === "pulsing") && (
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
