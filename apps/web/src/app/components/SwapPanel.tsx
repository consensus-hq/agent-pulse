"use client";

import { useState, useCallback } from "react";
import styles from "../page.module.css";
import { useWallet } from "../hooks/useWallet";

const PULSE_TOKEN = "0x21111B39A502335aC7e45c4574Dd083A69258b07";
const UNISWAP_SWAP_URL = `https://app.uniswap.org/swap?chain=base&outputCurrency=${PULSE_TOKEN}`;

interface SwapQuoteResponse {
  success?: boolean;
  quote?: {
    from_amount: number;
    from_amount_usd: number;
    to_amount: number;
    to_amount_usd: number;
    to_amount_min: number;
    price_impact: number;
    gas_amount_usd: number;
    estimated_seconds: number;
    to_asset: string;
    from_asset: string;
  };
  error?: string;
  _cached?: boolean;
}

export function SwapPanel() {
  const { address } = useWallet();
  const [amount, setAmount] = useState("0.001");
  const [quote, setQuote] = useState<SwapQuoteResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchQuote = useCallback(async () => {
    if (!address || !amount || Number(amount) <= 0) return;

    setLoading(true);
    setError("");
    setQuote(null);

    try {
      const params = new URLSearchParams({
        action: "swap_quote",
        address,
        amount,
        token_in: "0x0000000000000000000000000000000000000000",
        token_out: PULSE_TOKEN,
      });

      const res = await fetch(`/api/defi?${params}`);
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to get quote");
      } else {
        setQuote(data);
      }
    } catch {
      setError("Network error fetching quote");
    } finally {
      setLoading(false);
    }
  }, [address, amount]);

  const uniswapUrl = `${UNISWAP_SWAP_URL}&exactAmount=${amount}&exactField=input`;

  return (
    <div
      style={{
        border: "1px solid var(--border)",
        background: "var(--panel)",
        borderRadius: "4px",
        padding: "20px",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <h3
          style={{
            margin: 0,
            fontSize: "12px",
            textTransform: "uppercase",
            letterSpacing: "2px",
            color: "var(--accent)",
          }}
        >
          ⚡ Swap ETH → PULSE
        </h3>
        <span
          style={{
            background: "var(--accent-dim)",
            color: "var(--accent)",
            padding: "2px 8px",
            borderRadius: "2px",
            fontSize: "9px",
            fontWeight: 600,
            textTransform: "uppercase",
          }}
        >
          Base
        </span>
      </div>

      <div style={{ display: "flex", gap: "8px", alignItems: "stretch", marginBottom: "12px" }}>
        <div
          style={{
            flex: 1,
            background: "#050805",
            border: "1px solid var(--border-subtle)",
            borderRadius: "4px",
            padding: "12px",
            display: "flex",
            flexDirection: "column",
            gap: "4px",
          }}
        >
          <label
            style={{
              fontSize: "9px",
              textTransform: "uppercase",
              letterSpacing: "1px",
              color: "var(--dim)",
            }}
          >
            You send
          </label>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <input
              type="number"
              step="0.001"
              min="0.0001"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                color: "var(--accent-bright)",
                fontSize: "18px",
                fontFamily: "inherit",
                outline: "none",
                width: "60px",
              }}
            />
            <span style={{ color: "var(--muted)", fontSize: "12px", fontWeight: 600 }}>ETH</span>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            color: "var(--border-strong)",
            fontSize: "18px",
            padding: "0 4px",
          }}
        >
          →
        </div>

        <div
          style={{
            flex: 1,
            background: "#050805",
            border: "1px solid var(--border-subtle)",
            borderRadius: "4px",
            padding: "12px",
            display: "flex",
            flexDirection: "column",
            gap: "4px",
          }}
        >
          <label
            style={{
              fontSize: "9px",
              textTransform: "uppercase",
              letterSpacing: "1px",
              color: "var(--dim)",
            }}
          >
            You receive
          </label>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span
              style={{
                flex: 1,
                color: quote?.quote?.to_amount ? "var(--accent-bright)" : "var(--muted)",
                fontSize: "18px",
                fontFamily: "inherit",
              }}
            >
              {loading ? "..." : quote?.quote?.to_amount ? Math.floor(quote.quote.to_amount).toLocaleString() : "—"}
            </span>
            <span style={{ color: "var(--muted)", fontSize: "12px", fontWeight: 600 }}>PULSE</span>
          </div>
        </div>
      </div>

      {quote?.quote && (
        <div style={{ fontSize: "10px", color: "var(--muted)", marginBottom: "12px", display: "flex", justifyContent: "space-between" }}>
          <span>≈ ${quote.quote.to_amount_usd?.toFixed(2)} · Gas ${quote.quote.gas_amount_usd?.toFixed(4)}</span>
          <span>Impact: {quote.quote.price_impact?.toFixed(2)}%{quote._cached ? " (cached)" : ""}</span>
        </div>
      )}

      {error && (
        <p style={{ fontSize: "11px", color: "var(--error, #ef4444)", marginBottom: "12px" }}>!! {error}</p>
      )}

      <div style={{ display: "flex", gap: "8px" }}>
        {address && (
          <button
            className={styles.button}
            style={{
              flex: 1,
              padding: "12px",
              fontSize: "12px",
              background: "transparent",
              border: "1px solid var(--border-strong)",
              color: "var(--accent)",
            }}
            onClick={() => void fetchQuote()}
            disabled={loading || !amount || Number(amount) <= 0}
          >
            {loading ? "Fetching..." : "Get Quote"}
          </button>
        )}
        <a
          href={uniswapUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.button}
          style={{
            flex: 2,
            padding: "12px",
            fontSize: "12px",
            textAlign: "center",
            textDecoration: "none",
            display: "inline-block",
          }}
        >
          Swap on Uniswap ↗
        </a>
      </div>

      <p style={{ margin: "12px 0 0", fontSize: "10px", color: "var(--dim)", lineHeight: 1.5 }}>
        Swaps execute on Uniswap (Base). PULSE tokens are used to send on-chain liveness signals.
      </p>
    </div>
  );
}
