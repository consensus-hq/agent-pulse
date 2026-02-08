"use client";

import { useState } from "react";
import Link from "next/link";
import { SwapPanel } from "../components/SwapPanel";
import styles from "../page.module.css";

/* ───────────────────────────────────────────────────────────
 *  Data: DeFi actions available through the API
 * ─────────────────────────────────────────────────────────── */
const DEFI_ACTIONS = [
  {
    action: "swap_quote",
    title: "Swap Quote",
    cost: "$0.01",
    description: "Get real-time swap quotes across DEXs on Base. Returns optimal route, price impact, gas estimate, and minimum output.",
    curl: `curl "https://agent-pulse-nine.vercel.app/api/defi?action=swap_quote&address=0xYOUR_ADDR&amount=0.01&token_in=0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE&token_out=0x21111B39A502335aC7e45c4574Dd083A69258b07"`,
    response: `{
  "quote": {
    "from_amount": 0.01,
    "from_amount_usd": 25.12,
    "to_amount": 842000,
    "to_amount_usd": 24.98,
    "price_impact": 0.15,
    "gas_amount_usd": 0.0032,
    "estimated_seconds": 3
  }
}`,
  },
  {
    action: "gas_prices",
    title: "Gas Analysis",
    cost: "$0.001",
    description: "Current gas prices on Base chain. Helps agents optimize transaction timing and estimate costs before executing swaps.",
    curl: `curl "https://agent-pulse-nine.vercel.app/api/defi?action=gas_prices&address=0xYOUR_ADDR"`,
    response: `{
  "gas": {
    "chain": "base",
    "fast": "0.004 gwei",
    "standard": "0.002 gwei",
    "slow": "0.001 gwei"
  }
}`,
  },
  {
    action: "portfolio",
    title: "Portfolio Tracking",
    cost: "$0.01",
    description: "Full portfolio breakdown with USD values. Track any wallet\u2019s holdings across all tokens on Base.",
    curl: `curl "https://agent-pulse-nine.vercel.app/api/defi?action=portfolio&address=0xYOUR_ADDR"`,
    response: `{
  "portfolio": {
    "total_usd": 1842.50,
    "tokens": [
      { "symbol": "ETH", "balance": 0.5, "usd": 1255.00 },
      { "symbol": "PULSE", "balance": 500000, "usd": 15.00 },
      { "symbol": "USDC", "balance": 572.50, "usd": 572.50 }
    ]
  }
}`,
  },
  {
    action: "balances",
    title: "Token Balances",
    cost: "$0.005",
    description: "Raw token balances for a wallet on Base. Lightweight alternative to full portfolio when you just need quantities.",
    curl: `curl "https://agent-pulse-nine.vercel.app/api/defi?action=balances&address=0xYOUR_ADDR"`,
    response: `{
  "balances": [
    { "token": "ETH", "amount": "0.5" },
    { "token": "PULSE", "amount": "500000" },
    { "token": "USDC", "amount": "572.50" }
  ]
}`,
  },
  {
    action: "analyze_wallet",
    title: "Wallet Analysis",
    cost: "$0.01",
    description: "AI-powered wallet analysis. Evaluates transaction patterns, portfolio health, and risk exposure for any address.",
    curl: `curl "https://agent-pulse-nine.vercel.app/api/defi?action=analyze_wallet&address=0xYOUR_ADDR"`,
    response: `{
  "analysis": {
    "risk_score": 0.15,
    "activity_level": "active",
    "top_interactions": ["uniswap", "aave"],
    "recommendation": "Healthy diversified portfolio"
  }
}`,
  },
  {
    action: "token_price",
    title: "Token Price",
    cost: "$0.002",
    description: "Get current price for any token on Base by contract address. Includes USD price and 24h change.",
    curl: `curl "https://agent-pulse-nine.vercel.app/api/defi?action=token_price&address=0xYOUR_ADDR&token=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"`,
    response: `{
  "price": {
    "token": "USDC",
    "usd": 1.0001,
    "change_24h": 0.01
  }
}`,
  },
];

/* ───────────────────────────────────────────────────────────
 *  Code Block with copy button
 * ─────────────────────────────────────────────────────────── */
function CopyBlock({ code, label }: { code: string; label: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div style={{ position: "relative" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "4px",
        }}
      >
        <span style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "1px", color: "var(--dim)" }}>
          {label}
        </span>
        <button
          onClick={handleCopy}
          style={{
            background: "transparent",
            border: "1px solid var(--border)",
            color: copied ? "var(--accent)" : "var(--muted)",
            fontSize: "9px",
            padding: "2px 8px",
            cursor: "pointer",
            fontFamily: "inherit",
            borderRadius: "2px",
            transition: "all 0.15s",
          }}
        >
          {copied ? "copied ✓" : "copy"}
        </button>
      </div>
      <pre
        style={{
          background: "#050805",
          border: "1px solid var(--border-subtle)",
          borderRadius: "4px",
          padding: "12px",
          fontSize: "11px",
          lineHeight: 1.6,
          color: "var(--accent-bright)",
          overflowX: "auto",
          margin: 0,
          whiteSpace: "pre-wrap",
          wordBreak: "break-all",
        }}
      >
        {code}
      </pre>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────
 *  Action Card
 * ─────────────────────────────────────────────────────────── */
function ActionCard({
  action,
}: {
  action: (typeof DEFI_ACTIONS)[number];
}) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className={styles.section}
      style={{
        padding: "20px",
        gap: "12px",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <h3
          style={{
            margin: 0,
            fontSize: "14px",
            fontWeight: 600,
            color: "var(--accent)",
            textTransform: "uppercase",
            letterSpacing: "1px",
          }}
        >
          {action.title}
        </h3>
        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
          <span className={styles.tag}>{action.cost}</span>
          <span
            style={{
              background: "var(--panel-elevated)",
              color: "var(--muted)",
              padding: "2px 8px",
              borderRadius: "2px",
              fontSize: "9px",
              fontWeight: 600,
              fontFamily: "inherit",
            }}
          >
            {action.action}
          </span>
        </div>
      </div>

      <p style={{ margin: 0, fontSize: "12px", color: "var(--muted)", lineHeight: 1.6 }}>
        {action.description}
      </p>

      <button
        onClick={() => setOpen(!open)}
        style={{
          background: "transparent",
          border: "1px solid var(--border)",
          color: "var(--accent)",
          padding: "6px 12px",
          fontSize: "10px",
          textTransform: "uppercase",
          letterSpacing: "1px",
          cursor: "pointer",
          fontFamily: "inherit",
          borderRadius: "2px",
          transition: "all 0.15s",
          alignSelf: "flex-start",
        }}
      >
        {open ? "[ − hide example ]" : "[ + show example ]"}
      </button>

      {open && (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "4px" }}>
          <CopyBlock code={action.curl} label="curl request" />
          <CopyBlock code={action.response} label="response" />
        </div>
      )}
    </div>
  );
}

/* ───────────────────────────────────────────────────────────
 *  Page
 * ─────────────────────────────────────────────────────────── */
export default function DefiPage() {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        {/* Back navigation */}
        <nav
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderBottom: "1px solid var(--border)",
            paddingBottom: "10px",
            marginBottom: "8px",
            fontSize: "12px",
            letterSpacing: "1px",
            textTransform: "uppercase",
          }}
        >
          <Link
            href="/"
            style={{
              color: "var(--accent)",
              textDecoration: "none",
              transition: "color 0.15s",
            }}
          >
            ← Agent Pulse
          </Link>
          <span style={{ color: "var(--dim)", fontSize: "10px" }}>
            /defi
          </span>
        </nav>

        {/* Hero */}
        <section style={{ textAlign: "center", marginBottom: "16px" }}>
          <h1
            style={{
              fontSize: "2.5rem",
              fontWeight: 800,
              color: "var(--accent)",
              letterSpacing: "-0.04em",
              margin: "0 0 12px",
              textShadow: "0 0 10px rgba(74, 222, 128, 0.3)",
            }}
          >
            DeFi for Agents
          </h1>
          <p
            style={{
              color: "var(--muted)",
              fontSize: "14px",
              maxWidth: "640px",
              margin: "0 auto 24px",
              lineHeight: 1.7,
            }}
          >
            AI agents access real-time DeFi data through{" "}
            <span style={{ color: "var(--accent)" }}>x402 micropayments</span>.
            No API keys. No subscriptions. Just pay-per-call with USDC on Base.
          </p>

          {/* Powered by HeyElsa badge */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "10px",
              background: "var(--panel-elevated)",
              border: "1px solid var(--border-strong)",
              borderRadius: "4px",
              padding: "8px 20px",
              fontSize: "11px",
              letterSpacing: "0.5px",
            }}
          >
            <span
              style={{
                width: "8px",
                height: "8px",
                background: "var(--accent)",
                borderRadius: "50%",
                boxShadow: "0 0 6px var(--accent)",
                display: "inline-block",
                animation: "blink 1.5s infinite",
              }}
            />
            <span style={{ color: "var(--muted)" }}>Powered by</span>
            <span style={{ color: "var(--accent-bright)", fontWeight: 700 }}>
              HeyElsa x402
            </span>
          </div>
        </section>

        {/* How it works */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>How It Works</h2>
            <span className={styles.tag}>x402</span>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "16px",
            }}
          >
            {[
              {
                step: "01",
                title: "Agent calls API",
                desc: "Your agent sends a standard HTTP request to any DeFi endpoint. No auth headers needed.",
              },
              {
                step: "02",
                title: "402 Payment Required",
                desc: "Server responds with x402 payment requirements — amount, asset (USDC), and payTo address.",
              },
              {
                step: "03",
                title: "Micropayment",
                desc: "Agent signs an EIP-3009 TransferWithAuthorization for the exact amount ($0.001–$0.01 per call).",
              },
              {
                step: "04",
                title: "Data returned",
                desc: "Server verifies the payment signature and returns DeFi data. Cached for 60s to minimize costs.",
              },
            ].map((item) => (
              <div
                key={item.step}
                style={{
                  background: "var(--panel-elevated)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "4px",
                  padding: "16px",
                }}
              >
                <div
                  style={{
                    fontSize: "24px",
                    fontWeight: 800,
                    color: "var(--accent-dim)",
                    marginBottom: "8px",
                  }}
                >
                  {item.step}
                </div>
                <div
                  style={{
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "var(--accent)",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    marginBottom: "6px",
                  }}
                >
                  {item.title}
                </div>
                <div style={{ fontSize: "11px", color: "var(--muted)", lineHeight: 1.6 }}>
                  {item.desc}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Agent advantages */}
        <section
          style={{
            display: "flex",
            justifyContent: "center",
            flexWrap: "wrap",
            gap: "8px 24px",
            padding: "12px 16px",
            background: "var(--panel-elevated)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "4px",
            fontSize: "11px",
            color: "var(--muted)",
            textTransform: "uppercase",
            letterSpacing: "0.5px",
          }}
        >
          {[
            { value: "6", label: "DeFi endpoints" },
            { value: "$0.001", label: "min cost/call" },
            { value: "60s", label: "cache TTL" },
            { value: "0", label: "API keys needed" },
          ].map((s, i, arr) => (
            <span key={s.label}>
              <span style={{ color: "var(--accent)", fontWeight: 700 }}>{s.value}</span>{" "}
              {s.label}
              {i < arr.length - 1 && (
                <span style={{ marginLeft: "24px", color: "var(--border-strong)", userSelect: "none" }}>
                  ·
                </span>
              )}
            </span>
          ))}
        </section>

        {/* Live Swap Panel */}
        <section>
          <h2
            style={{
              margin: "0 0 16px",
              fontSize: "10px",
              textTransform: "uppercase",
              letterSpacing: "4px",
              color: "var(--dim)",
            }}
          >
            $ live-swap
          </h2>
          <SwapPanel />
        </section>

        {/* API Actions */}
        <section>
          <h2
            style={{
              margin: "0 0 16px",
              fontSize: "10px",
              textTransform: "uppercase",
              letterSpacing: "4px",
              color: "var(--dim)",
            }}
          >
            $ available-actions
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {DEFI_ACTIONS.map((action) => (
              <ActionCard key={action.action} action={action} />
            ))}
          </div>
        </section>

        {/* Integration guide */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Quick Integration</h2>
            <span className={styles.tag}>SDK</span>
          </div>
          <CopyBlock
            label="typescript"
            code={`import { AgentPulse } from "@agent-pulse/sdk";

const pulse = new AgentPulse();

// Get a swap quote — x402 payment handled automatically
const quote = await pulse.defi.swapQuote({
  address: "0xYOUR_WALLET",
  amount: "0.01",
  tokenIn: "ETH",
  tokenOut: "PULSE",
});

console.log(\`Receive: \${quote.to_amount} PULSE\`);
console.log(\`Gas: $\${quote.gas_amount_usd}\`);`}
          />
          <p style={{ margin: "8px 0 0", fontSize: "11px", color: "var(--muted)", lineHeight: 1.6 }}>
            The Agent Pulse SDK wraps x402 payment negotiation so your agent can call any DeFi
            endpoint with a single function call. Works from Node.js, Deno, and browser environments.
          </p>
        </section>

        {/* HeyElsa x402 explanation */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Why x402?</h2>
            <span className={styles.tag}>Protocol</span>
          </div>
          <div style={{ fontSize: "12px", color: "var(--muted)", lineHeight: 1.8 }}>
            <p style={{ margin: "0 0 12px" }}>
              <strong style={{ color: "var(--text)" }}>HTTP 402 Payment Required</strong> was reserved in
              the HTTP spec for exactly this: native web payments. The{" "}
              <span style={{ color: "var(--accent)" }}>x402 protocol</span> makes it real.
            </p>
            <p style={{ margin: "0 0 12px" }}>
              Instead of API keys and monthly subscriptions, agents pay per call with USDC on Base.
              Payment is verified via EIP-3009 signatures — no on-chain transaction needed until
              settlement, keeping costs at fractions of a cent.
            </p>
            <p style={{ margin: 0 }}>
              <strong style={{ color: "var(--text)" }}>HeyElsa</strong> provides the DeFi data layer —
              swap routing, portfolio analytics, gas optimization — all accessible through a single
              x402-enabled API. Agent Pulse proxies these calls server-side, handling payment
              automatically so users never see a wallet popup.
            </p>
          </div>
        </section>

        {/* Footer */}
        <footer
          style={{
            textAlign: "center",
            padding: "24px 0",
            borderTop: "1px solid var(--border-subtle)",
            fontSize: "11px",
            color: "var(--dim)",
          }}
        >
          <div style={{ marginBottom: "8px" }}>
            <Link
              href="/"
              style={{ color: "var(--accent)", textDecoration: "none", marginRight: "20px" }}
            >
              [Home]
            </Link>
            <Link
              href="/docs"
              style={{ color: "var(--accent)", textDecoration: "none", marginRight: "20px" }}
            >
              [Docs]
            </Link>
            <Link
              href="/build"
              style={{ color: "var(--accent)", textDecoration: "none" }}
            >
              [Build]
            </Link>
          </div>
          <p style={{ margin: 0 }}>
            Agent Pulse × HeyElsa x402 · Built for{" "}
            <span style={{ color: "var(--accent)" }}>ClawdKitchen Hackathon</span>
          </p>
        </footer>
      </main>
    </div>
  );
}
