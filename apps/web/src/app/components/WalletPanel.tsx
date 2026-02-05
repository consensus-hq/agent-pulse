"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { formatUnits } from "viem";
import styles from "../page.module.css";
import { publicEnv } from "../lib/env.public";
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
  if (!formatted.includes(".")) return formatted;
  const [whole, fraction] = formatted.split(".");
  const trimmed = fraction.slice(0, 4).replace(/0+$/, "");
  return trimmed ? `${whole}.${trimmed}` : whole;
};

const formatUnix = (seconds?: number | null) => {
  if (!seconds) return "—";
  const date = new Date(seconds * 1000);
  return Number.isNaN(date.getTime()) ? "—" : date.toISOString();
};

export default function WalletPanel() {
  const { address, isConnected } = useWallet();
  const {
    status,
    error,
    approve,
    pulse,
    allowance,
    balance,
    minPulseAmount,
    decimals,
    symbol,
    needsApproval,
    hasConfig,
    isReady,
    isPending,
    allowanceLoading,
    balanceLoading,
  } = usePulse();
  const agentStatus = useAgentStatus(address);

  const walletConnectEnabled = Boolean(publicEnv.walletConnectProjectId);

  const balanceLabel = balanceLoading
    ? "Loading…"
    : `${formatTokenAmount(balance, decimals)} ${symbol}`;
  const allowanceLabel = allowanceLoading
    ? "Loading…"
    : `${formatTokenAmount(allowance, decimals)} ${symbol}`;
  const minPulseLabel = minPulseAmount
    ? `${formatTokenAmount(minPulseAmount, decimals)} ${symbol}`
    : "—";

  const canApprove = isReady && needsApproval && !isPending;
  const canPulse = isReady && !needsApproval && minPulseAmount > 0n && !isPending;

  const pulseSignalLabel = agentStatus.loading
    ? "loading…"
    : agentStatus.isAlive === null
    ? "unknown"
    : agentStatus.isAlive
    ? "alive"
    : "stale";

  const statusMessage = (() => {
    if (status === "approving") return "Approval pending…";
    if (status === "approved") return "Approval confirmed.";
    if (status === "pulsing") return "Pulse pending…";
    if (status === "confirmed") return "Pulse confirmed.";
    if (status === "error") return error || "Transaction failed.";
    return "";
  })();

  const statusTone = status === "error"
    ? styles.statusError
    : status === "approved" || status === "confirmed"
    ? styles.statusSuccess
    : status === "approving" || status === "pulsing"
    ? styles.statusPending
    : "";

  return (
    <div className={styles.walletPanel}>
      <div className={styles.walletHeader}>
        <span className={styles.tag}>Wallet link</span>
        <ConnectButton chainStatus="icon" showBalance={false} />
      </div>

      {!walletConnectEnabled ? (
        <p className={styles.muted}>
          WalletConnect project ID missing. Injected wallets only.
        </p>
      ) : null}

      {!hasConfig ? (
        <p className={styles.error}>Pulse contract addresses not configured.</p>
      ) : null}

      {isConnected ? (
        <>
          <div className={styles.walletStats}>
            <div>
              <p className={styles.walletLabel}>Connected address</p>
              <p className={styles.walletValue}>{shortenAddress(address)}</p>
            </div>
            <div>
              <p className={styles.walletLabel}>PULSE balance</p>
              <p className={styles.walletValue}>{balanceLabel}</p>
            </div>
            <div>
              <p className={styles.walletLabel}>Allowance</p>
              <p className={styles.walletValue}>{allowanceLabel}</p>
            </div>
            <div>
              <p className={styles.walletLabel}>Pulse signal</p>
              <p className={styles.walletValue}>{pulseSignalLabel}</p>
            </div>
            <div>
              <p className={styles.walletLabel}>Streak</p>
              <p className={styles.walletValue}>
                {agentStatus.streak ?? "—"}
              </p>
            </div>
            <div>
              <p className={styles.walletLabel}>Last pulse</p>
              <p className={styles.walletValue}>
                {formatUnix(agentStatus.lastPulseAt)}
              </p>
            </div>
          </div>

          <div className={styles.row}>
            {needsApproval ? (
              <button
                className={styles.button}
                type="button"
                onClick={() => void approve()}
                disabled={!canApprove}
              >
                Approve
              </button>
            ) : (
              <button
                className={styles.button}
                type="button"
                onClick={() => void pulse()}
                disabled={!canPulse}
              >
                Send pulse
              </button>
            )}
            <span className={styles.muted}>Min pulse: {minPulseLabel}</span>
          </div>

          {statusMessage ? (
            <div className={styles.statusRow}>
              {(status === "approving" || status === "pulsing") && (
                <span className={styles.spinner} aria-hidden="true" />
              )}
              {(status === "approved" || status === "confirmed") && (
                <span className={styles.checkmark} aria-hidden="true">
                  ✓
                </span>
              )}
              <span className={statusTone}>{statusMessage}</span>
            </div>
          ) : null}
        </>
      ) : (
        <p className={styles.muted}>
          Connect a wallet to send an activity pulse signal.
        </p>
      )}
    </div>
  );
}
