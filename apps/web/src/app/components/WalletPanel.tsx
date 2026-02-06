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
  const { address, isConnected, isConnecting, isDisconnected, connectError } = useWallet();
  const {
    status,
    error,
    approvalMethod,
    approve,
    pulse,
    sendPulseAuto,
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

  const canPulse = isReady && minPulseAmount > 0n && !isPending;

  const pulseSignalLabel = agentStatus.loading
    ? "loading…"
    : agentStatus.isAlive === null
    ? "unknown"
    : agentStatus.isAlive
    ? "alive"
    : "stale";

  const statusMessage = (() => {
    if (status === "signing") return "Sign permit in wallet…";
    if (status === "approving") return approvalMethod === "permit"
      ? "Submitting permit…"
      : "Approval pending…";
    if (status === "approved") return "Approved — sending pulse…";
    if (status === "pulsing") return "Pulse pending…";
    if (status === "confirmed") return "Pulse confirmed.";
    if (status === "error") return error || "Transaction failed.";
    return "";
  })();

  const statusTone = status === "error"
    ? styles.statusError
    : status === "approved" || status === "confirmed"
    ? styles.statusSuccess
    : status === "signing" || status === "approving" || status === "pulsing"
    ? styles.statusPending
    : "";

  // Determine auth status for data attribute
  const authStatus = isConnected ? "connected" : "disconnected";

  return (
    <div 
      className={styles.walletPanel}
      data-auth-status={authStatus}
      data-wallet-address={address || ""}
    >
      <div className={styles.walletHeader}>
        <span className={styles.tag}>Wallet link</span>
        <ConnectButton.Custom>
          {({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted }) => {
            const ready = mounted;
            const connected = ready && account && chain;

            return (
              <div
                {...(!ready && {
                  "aria-hidden": true,
                  style: { opacity: 0, pointerEvents: "none", userSelect: "none" },
                })}
              >
                {(() => {
                  if (!connected) {
                    return (
                      <button onClick={openConnectModal} type="button" className={styles.button}>
                        Authenticate
                      </button>
                    );
                  }
                  if (chain.unsupported) {
                    return (
                      <button onClick={openChainModal} type="button" className={styles.button}>
                        Wrong network
                      </button>
                    );
                  }
                  return (
                    <button onClick={openAccountModal} type="button" className={styles.buttonGhost}>
                      {shortenAddress(account.address)}
                    </button>
                  );
                })()}
              </div>
            );
          }}
        </ConnectButton.Custom>
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
            <button
              className={styles.button}
              type="button"
              onClick={() => void sendPulseAuto()}
              disabled={!canPulse}
            >
              {needsApproval ? "Sign & Pulse" : "Send pulse"}
            </button>
            {needsApproval && (
              <button
                className={styles.buttonGhost}
                type="button"
                onClick={() => void approve()}
                disabled={!isReady || isPending}
                title="Use a standard ERC-20 approval transaction instead of EIP-2612 permit"
              >
                Approve (tx)
              </button>
            )}
            <span className={styles.muted}>Min pulse: {minPulseLabel}</span>
          </div>

          {statusMessage ? (
            <div className={styles.statusRow}>
              {(status === "signing" || status === "approving" || status === "pulsing") && (
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
        <div className={styles.walletStats} data-auth-status={isConnecting ? "connecting" : "disconnected"}>
          <div>
            <p className={styles.walletLabel}>Status</p>
            <p className={styles.walletValue}>
              {isConnecting ? (
                <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span className={styles.spinner} />
                  Connecting wallet…
                </span>
              ) : connectError ? (
                <span style={{ color: "var(--error)" }}>Connection failed</span>
              ) : (
                <span style={{ color: "var(--muted)" }}>Disconnected</span>
              )}
            </p>
          </div>
          {connectError && (
            <div>
              <p className={styles.walletLabel}>Error</p>
              <p className={styles.walletValue} style={{ color: "var(--error)", fontSize: "11px" }}>
                {connectError.message || "Failed to connect wallet"}
              </p>
            </div>
          )}
          <div>
            <p className={styles.walletLabel}>Action required</p>
            <p className={styles.walletValue}>
              Click <strong>Authenticate</strong> to connect your wallet
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
