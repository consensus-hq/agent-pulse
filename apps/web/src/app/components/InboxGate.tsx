"use client";

import { useMemo, useState } from "react";
import { isAddress } from "viem";
import styles from "../page.module.css";

type InboxKeyResponse = {
  ok: boolean;
  key?: string;
  expiresAt?: number;
  state?: "alive" | "stale" | "unknown";
  alive?: boolean;
  lastPulseAt?: number | null;
  reason?: string;
};

const ttlMinutes = Number.parseInt(
  process.env.NEXT_PUBLIC_INBOX_KEY_TTL_SECONDS || "3600",
  10
) / 60;

export default function InboxGate() {
  const [wallet, setWallet] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">(
    "idle"
  );
  const [response, setResponse] = useState<InboxKeyResponse | null>(null);
  const [taskResult, setTaskResult] = useState<string | null>(null);

  const isValid = isAddress(wallet.trim());
  const inboxUrl = useMemo(() => {
    if (!isValid) return "—";
    return `/api/inbox/${wallet.trim()}`;
  }, [wallet, isValid]);

  const maskedKey = response?.key
    ? `${response.key.slice(0, 4)}…${response.key.slice(-4)}`
    : "";

  const lastPulseLabel = response?.lastPulseAt
    ? new Date(response.lastPulseAt * 1000).toLocaleString()
    : "—";

  const expiresLabel = response?.expiresAt
    ? new Date(response.expiresAt).toLocaleString()
    : "—";

  const statusLabel = response?.state === "alive"
    ? "routable"
    : response?.state === "stale"
    ? "not routable"
    : response?.state ?? "unknown";

  async function handleGenerate() {
    if (!isValid) return;
    setStatus("loading");
    setTaskResult(null);
    try {
      const res = await fetch("/api/inbox-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: wallet.trim() }),
      });
      const data = (await res.json()) as InboxKeyResponse;
      setResponse(data);
      setStatus(res.ok ? "ready" : "error");
    } catch {
      setResponse({ ok: false, reason: "network_error" });
      setStatus("error");
    }
  }

  async function handleCopy() {
    if (!response?.key) return;
    await navigator.clipboard.writeText(response.key);
  }

  async function handleSendTest() {
    if (!response?.key || !isValid) return;
    setTaskResult(null);
    try {
      const res = await fetch(inboxUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${response.key}`,
        },
        body: JSON.stringify({
          task: { type: "ping", payload: { msg: "hello" } },
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setTaskResult("Job accepted.");
      } else {
        setTaskResult(data?.reason || "Job failed.");
      }
    } catch {
      setTaskResult("Job failed.");
    }
  }

  return (
    <div className={styles.inboxGrid}>
      <div className={styles.inboxPanel}>
        <div className={styles.sectionHeader}>
          <div>
            <h2>Agent Inbox (routing gate)</h2>
            <p className={styles.subtle}>
              Paid eligibility: pulse required to receive routed jobs. Optional
              ERC-8004 gate via REQUIRE_ERC8004. Keys are short-lived.
            </p>
          </div>
          <span
            className={`${styles.statusPill} ${
              response?.state === "alive" ? styles.statusChecked : ""
            }`}
          >
            {statusLabel}
          </span>
        </div>

        <label className={styles.label}>Wallet address</label>
        <input
          className={styles.inputField}
          value={wallet}
          onChange={(event) => setWallet(event.target.value)}
          placeholder="0x..."
        />

        <div className={styles.inboxRow}>
          <button
            className={styles.primaryButton}
            onClick={handleGenerate}
            disabled={!isValid || status === "loading"}
          >
            Unlock inbox key
          </button>
          <span className={styles.subtle}>Expires in ~{ttlMinutes} min</span>
        </div>

        {status === "error" && (
          <p className={styles.subtle}>
            {response?.reason === "not_alive"
              ? "Not routable: pulse required."
              : response?.reason === "not_registered"
              ? "ERC-8004 registration required."
              : "Unable to issue key."}
          </p>
        )}

        {status === "ready" && response?.key && (
          <div className={styles.inboxCard}>
            <div>
              <p className={styles.label}>Inbox URL</p>
              <p className={styles.mono}>{inboxUrl}</p>
            </div>
            <div>
              <p className={styles.label}>API key (masked)</p>
              <div className={styles.keyRow}>
                <span className={styles.mono}>{maskedKey}</span>
                <button className={styles.secondaryButton} onClick={handleCopy}>
                  Copy
                </button>
              </div>
            </div>
            <div className={styles.inboxMeta}>
              <div>
                <p className={styles.label}>Last pulse</p>
                <p className={styles.subtle}>{lastPulseLabel}</p>
              </div>
              <div>
                <p className={styles.label}>Key expires</p>
                <p className={styles.subtle}>{expiresLabel}</p>
              </div>
            </div>
            <div className={styles.inboxRow}>
              <button
                className={styles.secondaryButton}
                onClick={handleSendTest}
              >
                Send test job
              </button>
              <span className={styles.subtle}>{taskResult ?? ""}</span>
            </div>
          </div>
        )}

        <p className={styles.subtle}>
          Paid eligibility adds anti-spam friction. Routing only.
        </p>
      </div>
    </div>
  );
}
