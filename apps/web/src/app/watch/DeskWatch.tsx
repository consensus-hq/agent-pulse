"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useChainId, useWalletClient } from "wagmi";
import { isAddress, type Hex, type WalletClient } from "viem";
import { publicEnv } from "../lib/env.public";
import { useAgentStatus } from "../hooks/useAgentStatus";

// ============================================================================
// Config
// ============================================================================

const ROUND_DURATION_MS = 60 * 60 * 1000;
const POLL_INTERVAL_MS = 3000;
const GAME_TTL_MS = 5 * 60 * 1000; // tighter than protocol TTL (game mechanic)

type WatchTierId = "scout" | "sentinel" | "sniper";

type WatchTier = {
  id: WatchTierId;
  label: string;
  icon: string;
  costUsd: number;
  multiplier: number;
  color: string;
};

const WATCH_TIERS: WatchTier[] = [
  { id: "scout", label: "Scout", icon: "👀", costUsd: 0.1, multiplier: 1, color: "#00ff88" },
  { id: "sentinel", label: "Sentinel", icon: "🔭", costUsd: 0.5, multiplier: 3, color: "#88aaff" },
  { id: "sniper", label: "Sniper", icon: "🎯", costUsd: 1.0, multiplier: 7, color: "#ffaa00" },
];

type DeskId = "desk-vc" | "desk-cb" | "desk-03";

type DeskConfig = {
  id: DeskId;
  name: string;
  agent: `0x${string}`;
  cycle: string;
  riskLevel: "HIGH" | "MEDIUM" | "LOW";
  model: string;
};

type GameStatus = "active" | "warning" | "dead" | "unknown";

const STATUS_CONFIG: Record<GameStatus, { color: string; bg: string; label: string; glow: string }> = {
  active: { color: "#00ff88", bg: "rgba(0,255,136,0.08)", label: "LIVE", glow: "0 0 12px rgba(0,255,136,0.4)" },
  warning: { color: "#ffaa00", bg: "rgba(255,170,0,0.08)", label: "DELAYED", glow: "0 0 12px rgba(255,170,0,0.4)" },
  dead: { color: "#ff3355", bg: "rgba(255,51,85,0.12)", label: "MISSED", glow: "0 0 20px rgba(255,51,85,0.6)" },
  unknown: { color: "#666", bg: "rgba(255,255,255,0.04)", label: "UNKNOWN", glow: "none" },
};

const RISK_COLORS: Record<DeskConfig["riskLevel"], string> = {
  HIGH: "#ff3355",
  MEDIUM: "#ffaa00",
  LOW: "#00ff88",
};

// ============================================================================
// Money formatting (micro-USDC)
// ============================================================================

function formatUsdFromMicro(atomic: string | bigint): string {
  const v = typeof atomic === "bigint" ? atomic : BigInt(atomic || "0");
  const whole = v / 1_000_000n;
  const cents = (v % 1_000_000n) / 10_000n; // truncate to 2 decimals
  return `${whole.toString()}.${cents.toString().padStart(2, "0")}`;
}

// ============================================================================
// x402 (client-side) — Exact EIP-3009 signature payload
// ============================================================================

type X402Accept = {
  scheme: string;
  network: string;
  maxAmountRequired: string;
  asset: string;
  payTo: string;
  maxTimeoutSeconds?: number;
  extra?: { name?: string; version?: string };
};

const TRANSFER_WITH_AUTHORIZATION_TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

function randomBytes32Hex(): Hex {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `0x${hex}`;
}

function parseEip155ChainId(network: string): number | null {
  const m = network.match(/^eip155:(\d+)$/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

async function createX402ExactPaymentHeader(args: {
  accept: X402Accept;
  walletClient: WalletClient;
  from: `0x${string}`;
}): Promise<string> {
  const { accept, walletClient, from } = args;
  const chainId = parseEip155ChainId(accept.network) ?? 8453;

  if (!isAddress(accept.asset) || !isAddress(accept.payTo)) {
    throw new Error("Invalid x402 accept payload (asset/payTo)");
  }

  const now = Math.floor(Date.now() / 1000);
  const validAfter = 0n;
  const validBefore = BigInt(now + (accept.maxTimeoutSeconds ?? 300));
  const nonce = randomBytes32Hex();
  const value = BigInt(accept.maxAmountRequired);

  const signature = await walletClient.signTypedData({
    domain: {
      name: accept.extra?.name ?? "USD Coin",
      version: accept.extra?.version ?? "2",
      chainId,
      verifyingContract: accept.asset as `0x${string}`,
    },
    types: TRANSFER_WITH_AUTHORIZATION_TYPES,
    primaryType: "TransferWithAuthorization",
    message: {
      from,
      to: accept.payTo as `0x${string}`,
      value,
      validAfter,
      validBefore,
      nonce,
    },
    account: from,
  });

  const payload = {
    x402Version: 1,
    scheme: "exact",
    network: accept.network,
    payload: {
      signature,
      authorization: {
        from,
        to: accept.payTo,
        value: accept.maxAmountRequired,
        validAfter: "0",
        validBefore: String(Number(validBefore)),
        nonce,
      },
    },
  };

  // Base64 encode the JSON payload for X-PAYMENT
  return btoa(JSON.stringify(payload));
}

// ============================================================================
// UI Helpers
// ============================================================================

function getTimeStrMs(tsMs: number): string {
  return new Date(tsMs).toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function computeGameStatus(params: {
  isAlive: boolean | null;
  lastPulseAt: number | null; // seconds
}): { status: GameStatus; ageMs: number | null } {
  if (!params.lastPulseAt) return { status: "unknown", ageMs: null };

  const ageMs = Date.now() - params.lastPulseAt * 1000;
  if (params.isAlive === false) return { status: "dead", ageMs };
  if (ageMs > GAME_TTL_MS) return { status: "dead", ageMs };
  if (ageMs > GAME_TTL_MS * 0.6) return { status: "warning", ageMs };
  return { status: "active", ageMs };
}

function HeartbeatLine({ data, color, width = 300, height = 44 }: { data: number[]; color: string; width?: number; height?: number }) {
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - (v / 100) * height;
      return `${x},${y}`;
    })
    .join(" ");
  // Stable across renders/SSR to satisfy `react-hooks/purity` and avoid SVG id collisions.
  const reactId = useId();
  const id = `grad-${reactId}`.replace(/[^a-zA-Z0-9_-]/g, "");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height, overflow: "visible", display: "block" }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${height} ${points} ${width},${height}`} fill={`url(#${id})`} />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        style={{ filter: `drop-shadow(0 0 3px ${color}40)` }}
      />
      <circle
        cx={width}
        cy={height - (data[data.length - 1] / 100) * height}
        r="3"
        fill={color}
        style={{ filter: `drop-shadow(0 0 6px ${color})` }}
      />
    </svg>
  );
}

function PulseRing({ status, size = 10 }: { status: GameStatus; size?: number }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.active;
  return (
    <div
      style={{
        position: "relative",
        width: size * 2.5,
        height: size * 2.5,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {status === "active" && (
        <div
          style={{
            position: "absolute",
            width: size * 2.5,
            height: size * 2.5,
            borderRadius: "50%",
            background: cfg.color,
            opacity: 0.3,
            animation: "pulseRing 2s ease-out infinite",
          }}
        />
      )}
      {status === "dead" && (
        <div
          style={{
            position: "absolute",
            width: size * 2.5,
            height: size * 2.5,
            borderRadius: "50%",
            background: cfg.color,
            opacity: 0.4,
            animation: "deathPulse 0.6s ease-in-out infinite",
          }}
        />
      )}
      <div
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          background: cfg.color,
          boxShadow: cfg.glow,
          position: "relative",
          zIndex: 1,
        }}
      />
    </div>
  );
}

function TimeSince({ timestampSec }: { timestampSec: number | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  if (!timestampSec) return <span>—</span>;
  const timestampMs = timestampSec * 1000;
  const diff = Math.max(0, Math.floor((now - timestampMs) / 1000));
  if (diff < 60) return <span>{diff}s ago</span>;
  if (diff < 3600) return <span>{Math.floor(diff / 60)}m {diff % 60}s ago</span>;
  return <span>{Math.floor(diff / 3600)}h {Math.floor((diff % 3600) / 60)}m ago</span>;
}

function RoundTimer({ startedAt, endsAt }: { startedAt: number; endsAt: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const remaining = Math.max(0, endsAt - now);
  const mins = Math.floor(remaining / 60000);
  const secs = Math.floor((remaining % 60000) / 1000);
  const pct = ((ROUND_DURATION_MS - remaining) / ROUND_DURATION_MS) * 100;

  return (
    <div
      style={{
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 12,
        padding: "14px 20px",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 10,
            color: "#555",
            letterSpacing: "0.1em",
          }}
        >
          ROUND TIMER
        </div>
        <div
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 18,
            fontWeight: 700,
            color: remaining < 300000 ? "#ff3355" : "#00ff88",
          }}
        >
          {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}
        </div>
      </div>
      <div style={{ height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            background:
              remaining < 300000
                ? "linear-gradient(90deg, #ff3355, #ff6688)"
                : "linear-gradient(90deg, #00ff88, #88ffcc)",
            borderRadius: 2,
            transition: "width 1s linear",
          }}
        />
      </div>
    </div>
  );
}

function TierSelector({
  selectedTier,
  onSelect,
  disabled,
}: {
  selectedTier: WatchTier | null;
  onSelect: (t: WatchTier) => void;
  disabled: boolean;
}) {
  return (
    <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
      {WATCH_TIERS.map((tier) => (
        <button
          key={tier.id}
          onClick={(e) => {
            e.stopPropagation();
            if (!disabled) onSelect(tier);
          }}
          disabled={disabled}
          style={{
            flex: 1,
            padding: "8px 4px",
            borderRadius: 10,
            border: `1px solid ${selectedTier?.id === tier.id ? tier.color + "60" : "rgba(255,255,255,0.08)"}`,
            background: selectedTier?.id === tier.id ? tier.color + "12" : "rgba(255,255,255,0.02)",
            color: selectedTier?.id === tier.id ? tier.color : "#666",
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 10,
            cursor: disabled ? "not-allowed" : "pointer",
            transition: "all 0.2s ease",
            opacity: disabled ? 0.4 : 1,
            textAlign: "center",
            lineHeight: 1.4,
          }}
        >
          <div style={{ fontSize: 14 }}>{tier.icon}</div>
          <div style={{ fontWeight: 600 }}>{tier.label}</div>
          <div style={{ color: selectedTier?.id === tier.id ? tier.color : "#444", fontSize: 9 }}>
            ${tier.costUsd.toFixed(2)}
          </div>
          <div style={{ fontSize: 8, color: "#555" }}>{tier.multiplier}x</div>
        </button>
      ))}
    </div>
  );
}

function WatchButton({
  selectedTier,
  onWatch,
  isWatching,
  disabled,
}: {
  selectedTier: WatchTier | null;
  onWatch: () => void;
  isWatching: boolean;
  disabled: boolean;
}) {
  const [hovered, setHovered] = useState(false);

  if (isWatching) {
    return (
      <div
        style={{
          marginTop: 10,
          padding: "10px 16px",
          borderRadius: 10,
          background: "rgba(0,255,136,0.06)",
          border: "1px solid rgba(0,255,136,0.2)",
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 11,
          color: "#00ff88",
          textAlign: "center",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
        }}
      >
        <div
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "#00ff88",
            animation: "pulseRing 2s ease-out infinite",
          }}
        />
        WATCHING · {selectedTier?.icon} {selectedTier?.label}
      </div>
    );
  }

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled && selectedTier) onWatch();
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      disabled={!selectedTier || disabled}
      style={{
        marginTop: 10,
        width: "100%",
        padding: "12px 16px",
        borderRadius: 10,
        border: `1px solid ${
          selectedTier ? (hovered ? "#00ff88" + "80" : "#00ff88" + "30") : "rgba(255,255,255,0.08)"
        }`,
        background: selectedTier
          ? hovered
            ? "rgba(0,255,136,0.12)"
            : "rgba(0,255,136,0.04)"
          : "rgba(255,255,255,0.02)",
        color: selectedTier ? "#00ff88" : "#444",
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: "0.06em",
        cursor: selectedTier && !disabled ? "pointer" : "not-allowed",
        transition: "all 0.25s ease",
        opacity: disabled ? 0.4 : 1,
        transform: hovered && selectedTier ? "translateY(-1px)" : "none",
      }}
    >
      {selectedTier ? `⚡ WATCH — $${selectedTier.costUsd.toFixed(2)} via x402` : "SELECT A TIER"}
    </button>
  );
}

type StatusResponse = {
  round: { id: string; startedAt: number; endsAt: number; remainingMs: number; status: string };
  deskStats: Record<string, { watchers: number; poolAtomic: string; totalWeight: number; isDead: boolean; deathId?: string }>;
  totals: { watchers: number; poolAtomic: string; deaths: number; claimedAtomic: string };
  serverTime: number;
};

type FeedResponse = {
  events: Array<{ id: string; type: string; createdAt: number; message: string; deskId?: string; wallet?: string; tier?: string; amountAtomic?: string }>;
  serverTime: number;
};

type LeaderboardResponse = {
  leaderboard: Array<{ wallet: string; totalEarningsAtomic: string; desksCaught: number; totalWatches: number }>;
};

type MyWatch = {
  deskId: DeskId;
  tier: WatchTierId;
  costUsd: number;
  multiplier: number;
  createdAt: number;
  claimed: boolean;
  claimedRewardAtomic?: string;
};

function DeskCard({
  desk,
  status,
  lastPulseAt,
  heartbeats,
  watchers,
  poolAtomic,
  myWatch,
  walletConnected,
  busy,
  onWatch,
  onClaim,
}: {
  desk: DeskConfig;
  status: GameStatus;
  lastPulseAt: number | null;
  heartbeats: number[];
  watchers: number;
  poolAtomic: string;
  myWatch: MyWatch | undefined;
  walletConnected: boolean;
  busy: boolean;
  onWatch: (tier: WatchTier) => void;
  onClaim: () => void;
}) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.active;
  const isDead = status === "dead";
  const [hovered, setHovered] = useState(false);
  const [selectedTier, setSelectedTier] = useState<WatchTier | null>(null);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: isDead
          ? "rgba(255,51,85,0.03)"
          : hovered
            ? "rgba(255,255,255,0.02)"
            : "rgba(255,255,255,0.01)",
        border: `1px solid ${isDead ? "rgba(255,51,85,0.2)" : "rgba(255,255,255,0.06)"}`,
        borderRadius: 16,
        padding: "20px 24px",
        transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        transform: hovered ? "translateY(-2px)" : "none",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Death overlay */}
      {isDead && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            background:
              "repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(255,51,85,0.03) 10px, rgba(255,51,85,0.03) 20px)",
            animation: "deathScan 2s linear infinite",
          }}
        />
      )}

      {/* Header row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <PulseRing status={status} />
          <div>
            <div
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontWeight: 700,
                fontSize: 14,
                color: "#eee",
                letterSpacing: "0.01em",
              }}
            >
              {desk.name}
            </div>
            <div
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 10,
                color: "#555",
                marginTop: 2,
                display: "flex",
                gap: 8,
                alignItems: "center",
              }}
            >
              <span>{desk.id}</span>
              <span
                style={{
                  color: RISK_COLORS[desk.riskLevel],
                  fontSize: 9,
                  background: RISK_COLORS[desk.riskLevel] + "15",
                  padding: "1px 6px",
                  borderRadius: 8,
                }}
              >
                {desk.riskLevel} RISK
              </span>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {watchers > 0 && (
            <div
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 10,
                color: "#88aaff",
                background: "rgba(136,170,255,0.08)",
                padding: "4px 10px",
                borderRadius: 20,
                border: "1px solid rgba(136,170,255,0.15)",
              }}
            >
              👀 {watchers}
            </div>
          )}
          <div
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 10,
              fontWeight: 600,
              color: cfg.color,
              background: cfg.bg,
              padding: "4px 10px",
              borderRadius: 20,
              letterSpacing: "0.1em",
              border: `1px solid ${cfg.color}20`,
            }}
          >
            {cfg.label}
          </div>
        </div>
      </div>

      {/* Info row */}
      <div style={{ display: "flex", gap: 20, marginBottom: 12, flexWrap: "wrap" }}>
        {[
          { label: "CYCLE", value: desk.cycle },
          { label: "MODEL", value: desk.model },
        ].map((item) => (
          <div key={item.label}>
            <div
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 9,
                color: "#444",
                letterSpacing: "0.08em",
                marginBottom: 3,
              }}
            >
              {item.label}
            </div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: "#999" }}>{item.value}</div>
          </div>
        ))}
      </div>

      {/* Heartbeat */}
      <HeartbeatLine data={heartbeats} color={cfg.color} />

      {/* Stats row */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: 12,
          paddingTop: 12,
          borderTop: "1px solid rgba(255,255,255,0.04)",
        }}
      >
        <div style={{ display: "flex", gap: 18 }}>
          <div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: "#444", letterSpacing: "0.08em" }}>
              POOL
            </div>
            <div
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 13,
                fontWeight: 500,
                color: "#ffaa00",
                marginTop: 2,
              }}
            >
              ${formatUsdFromMicro(poolAtomic)}
            </div>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: "#444", letterSpacing: "0.08em" }}>
            LAST PULSE
          </div>
          <div
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 13,
              fontWeight: 500,
              color: cfg.color,
              marginTop: 2,
            }}
          >
            <TimeSince timestampSec={lastPulseAt} />
          </div>
        </div>
      </div>

      {/* Watch controls */}
      {walletConnected && !isDead && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.04)" }}>
          <TierSelector
            selectedTier={myWatch ? WATCH_TIERS.find((t) => t.id === myWatch.tier)! : selectedTier}
            onSelect={setSelectedTier}
            disabled={Boolean(myWatch) || busy}
          />
          <WatchButton
            selectedTier={myWatch ? WATCH_TIERS.find((t) => t.id === myWatch.tier)! : selectedTier}
            onWatch={() => selectedTier && onWatch(selectedTier)}
            isWatching={Boolean(myWatch)}
            disabled={busy || !selectedTier}
          />
        </div>
      )}

      {/* Claim */}
      {isDead && myWatch && !myWatch.claimed && (
        <div
          style={{
            marginTop: 14,
            paddingTop: 14,
            borderTop: "1px solid rgba(255,51,85,0.2)",
            animation: "deathGlow 1.5s ease-in-out infinite",
          }}
        >
          <div
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 12,
              color: "#ff3355",
              textAlign: "center",
              marginBottom: 8,
            }}
          >
            🚨 MISSED TTL — READY TO CLAIM
          </div>
          <button
            onClick={onClaim}
            disabled={busy}
            style={{
              width: "100%",
              padding: "14px",
              borderRadius: 10,
              border: "1px solid rgba(255,51,85,0.4)",
              background: "linear-gradient(135deg, rgba(255,51,85,0.15), rgba(255,51,85,0.05))",
              color: "#ff3355",
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: "0.06em",
              cursor: busy ? "not-allowed" : "pointer",
              boxShadow: "0 0 20px rgba(255,51,85,0.2)",
              transition: "all 0.2s ease",
              opacity: busy ? 0.6 : 1,
            }}
          >
            {busy ? "CLAIMING..." : "CLAIM"}
          </button>
        </div>
      )}

      {!walletConnected && (
        <div
          style={{
            marginTop: 14,
            paddingTop: 14,
            borderTop: "1px solid rgba(255,255,255,0.04)",
            textAlign: "center",
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 11,
            color: "#444",
          }}
        >
          Connect wallet to watch
        </div>
      )}
    </div>
  );
}

function NetworkStats({
  liveCount,
  totalDesks,
  totals,
  isNarrow,
}: {
  liveCount: number;
  totalDesks: number;
  totals: StatusResponse["totals"] | null;
  isNarrow: boolean;
}) {
  const totalWatchers = totals?.watchers ?? 0;
  const totalPoolAtomic = totals?.poolAtomic ?? "0";
  const deaths = totals?.deaths ?? 0;
  const claimedAtomic = totals?.claimedAtomic ?? "0";

  const stats = [
    { label: "LIVE DESKS", value: `${liveCount}/${totalDesks}`, color: liveCount === totalDesks ? "#00ff88" : "#ffaa00" },
    { label: "ACTIVE WATCHERS", value: totalWatchers.toString(), color: "#88aaff" },
    { label: "POOL", value: `$${formatUsdFromMicro(totalPoolAtomic)}`, color: "#ffaa00" },
    { label: "DEATHS", value: deaths.toString(), color: deaths > 0 ? "#ff3355" : "#444" },
    { label: "CLAIMED", value: `$${formatUsdFromMicro(claimedAtomic)}`, color: "#aa88ff" },
  ];

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: isNarrow ? "repeat(2, 1fr)" : "repeat(5, 1fr)",
        gap: 10,
        marginBottom: 28,
      }}
    >
      {stats.map((s) => (
        <div
          key={s.label}
          style={{
            background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 12,
            padding: "14px 12px",
            textAlign: "center",
          }}
        >
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: "#444", letterSpacing: "0.1em", marginBottom: 6 }}>
            {s.label}
          </div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 18, fontWeight: 800, color: s.color, letterSpacing: "-0.02em" }}>
            {s.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function WatchPanel({ myWatches, desks }: { myWatches: MyWatch[]; desks: DeskConfig[] }) {
  if (myWatches.length === 0) return null;

  return (
    <div
      style={{
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 16,
        padding: 20,
        marginBottom: 24,
      }}
    >
      <div
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 11,
          color: "#555",
          letterSpacing: "0.1em",
          marginBottom: 16,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span style={{ fontSize: 14 }}>👁️</span> YOUR WATCHES
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {myWatches.map((w) => {
          const desk = desks.find((d) => d.id === w.deskId);
          const tier = WATCH_TIERS.find((t) => t.id === w.tier)!;
          return (
            <div
              key={`${w.deskId}-${w.createdAt}`}
              style={{
                background: "rgba(255,255,255,0.03)",
                border: `1px solid ${tier.color}20`,
                borderRadius: 10,
                padding: "12px 16px",
                minWidth: 180,
                opacity: w.claimed ? 0.6 : 1,
              }}
            >
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 800, color: "#ddd", marginBottom: 4 }}>
                {desk?.name || w.deskId}
              </div>
              <div
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 10,
                  color: tier.color,
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                }}
              >
                <span>
                  {tier.icon} {tier.label}
                </span>
                <span style={{ color: "#444" }}>·</span>
                <span>${w.costUsd.toFixed(2)}</span>
                <span style={{ color: "#444" }}>·</span>
                <span>{tier.multiplier}x</span>
              </div>
              {w.claimed && w.claimedRewardAtomic && (
                <div style={{ marginTop: 6, fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "#00ff88" }}>
                  Claimed ${formatUsdFromMicro(w.claimedRewardAtomic)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Leaderboard({ entries }: { entries: LeaderboardResponse["leaderboard"] }) {
  if (entries.length === 0) return null;

  return (
    <div
      style={{
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 16,
        padding: 20,
      }}
    >
      <div
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 11,
          color: "#555",
          letterSpacing: "0.1em",
          marginBottom: 16,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span style={{ fontSize: 14 }}>🏆</span> LEADERBOARD
      </div>
      {entries.map((e, i) => (
        <div
          key={e.wallet}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "10px 14px",
            borderRadius: 8,
            background: i === 0 ? "rgba(255,170,0,0.04)" : "transparent",
            borderBottom: "1px solid rgba(255,255,255,0.03)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 12,
                fontWeight: 900,
                color: i === 0 ? "#ffaa00" : i === 1 ? "#aaa" : i === 2 ? "#aa6633" : "#555",
                width: 24,
                textAlign: "center",
              }}
            >
              {i === 0 ? "👑" : `#${i + 1}`}
            </div>
            <div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: "#ccc" }}>
                {e.wallet.slice(0, 6)}...{e.wallet.slice(-4)}
              </div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: "#555" }}>
                {e.desksCaught} desks caught · {e.totalWatches} watches
              </div>
            </div>
          </div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, fontWeight: 900, color: "#00ff88" }}>
            ${formatUsdFromMicro(e.totalEarningsAtomic)}
          </div>
        </div>
      ))}
    </div>
  );
}

function EventLog({ events, desksById }: { events: FeedResponse["events"]; desksById: Record<string, string> }) {
  const typeColors: Record<string, string> = {
    watch: "#aa88ff",
    death: "#ff3355",
    claim: "#ffaa00",
    round_start: "#88aaff",
    round_end: "#88aaff",
  };

  return (
    <div
      style={{
        background: "rgba(255,255,255,0.01)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 16,
        padding: 20,
        maxHeight: 420,
        overflow: "auto",
      }}
    >
      <div
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 11,
          color: "#555",
          letterSpacing: "0.1em",
          marginBottom: 16,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#00ff88", animation: "pulseRing 2s ease-out infinite" }} />
        LIVE EVENT LOG
      </div>
      {events.map((e, i) => (
        <div
          key={e.id}
          style={{
            display: "flex",
            gap: 12,
            padding: "8px 0",
            borderBottom: "1px solid rgba(255,255,255,0.03)",
            alignItems: "flex-start",
            animation: i < 3 ? `fadeSlideIn 0.3s ease-out ${i * 0.05}s both` : "none",
          }}
        >
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#444", minWidth: 78, flexShrink: 0 }}>
            {getTimeStrMs(e.createdAt)}
          </div>
          <div
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 9,
              color: typeColors[e.type] || "#666",
              background: (typeColors[e.type] || "#666") + "12",
              padding: "2px 8px",
              borderRadius: 10,
              letterSpacing: "0.05em",
              minWidth: 62,
              textAlign: "center",
              flexShrink: 0,
            }}
          >
            {e.type.toUpperCase()}
          </div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#888", minWidth: 120, flexShrink: 0 }}>
            {e.deskId ? (desksById[e.deskId] ?? e.deskId) : "System"}
          </div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#666" }}>{e.message}</div>
        </div>
      ))}
    </div>
  );
}

function DeathModal({
  deskName,
  rewardUsd,
  onClaim,
  onClose,
  busy,
}: {
  deskName: string;
  rewardUsd: string;
  onClaim: () => void;
  onClose: () => void;
  busy: boolean;
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(0,0,0,0.85)",
        backdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        animation: "fadeSlideIn 0.3s ease-out",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#12121a",
          border: "1px solid rgba(255,51,85,0.3)",
          borderRadius: 24,
          padding: "40px 48px",
          maxWidth: 460,
          textAlign: "center",
          boxShadow: "0 0 60px rgba(255,51,85,0.15)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 3,
            background: "linear-gradient(90deg, transparent, #ff3355, transparent)",
          }}
        />

        <div style={{ fontSize: 48, marginBottom: 16 }}>💀</div>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 22, fontWeight: 900, color: "#ff3355", marginBottom: 8 }}>
          MISSED TTL
        </div>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: "#aaa", marginBottom: 18 }}>
          {deskName} missed its heartbeat window
        </div>
        <div
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 40,
            fontWeight: 900,
            color: "#00ff88",
            marginBottom: 8,
            textShadow: "0 0 30px rgba(0,255,136,0.4)",
          }}
        >
          +${rewardUsd}
        </div>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#666", marginBottom: 28 }}>
          YOUR SHARE OF THE POOL
        </div>
        <button
          onClick={onClaim}
          disabled={busy}
          style={{
            width: "100%",
            padding: "16px",
            borderRadius: 12,
            border: "none",
            background: "linear-gradient(135deg, #00ff88, #00cc66)",
            color: "#08090c",
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 16,
            fontWeight: 900,
            cursor: busy ? "not-allowed" : "pointer",
            letterSpacing: "0.02em",
            boxShadow: "0 0 30px rgba(0,255,136,0.3)",
            transition: "all 0.2s ease",
            opacity: busy ? 0.7 : 1,
          }}
        >
          {busy ? "CLAIMING..." : "CLAIM"}
        </button>
      </div>
    </div>
  );
}

function normalizeAddress(value: string): `0x${string}` | null {
  if (!value) return null;
  const v = value.trim();
  return isAddress(v) ? (v.toLowerCase() as `0x${string}`) : null;
}

export default function DeskWatch() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { data: walletClient } = useWalletClient();

  const vcAgent = normalizeAddress(publicEnv.deskWatchDeskVcAgent);
  const cbAgent = normalizeAddress(publicEnv.deskWatchDeskCbAgent);
  const d3Agent = normalizeAddress(publicEnv.deskWatchDesk03Agent);

  const vcStatus = useAgentStatus(vcAgent ?? undefined);
  const cbStatus = useAgentStatus(cbAgent ?? undefined);
  const d3Status = useAgentStatus(d3Agent ?? undefined);

  const desks: Array<DeskConfig & { lastPulseAt: number | null; gameStatus: GameStatus }> = useMemo(() => {
    const out: Array<DeskConfig & { lastPulseAt: number | null; gameStatus: GameStatus }> = [];

    const items: Array<[DeskConfig | null, typeof vcStatus]> = [
      [
        vcAgent
          ? { id: "desk-vc", name: "Volatility Cult", agent: vcAgent, cycle: "3 min", riskLevel: "HIGH", model: "GPT-5.3" }
          : null,
        vcStatus,
      ],
      [
        cbAgent
          ? { id: "desk-cb", name: "Cold Blood", agent: cbAgent, cycle: "5 min", riskLevel: "MEDIUM", model: "GPT-5.3" }
          : null,
        cbStatus,
      ],
      [
        d3Agent
          ? { id: "desk-03", name: "Phantom Grid", agent: d3Agent, cycle: "2 min", riskLevel: "LOW", model: "Opus 4.6" }
          : null,
        d3Status,
      ],
    ];

    for (const [cfg, s] of items) {
      if (!cfg) continue;
      const game = computeGameStatus({ isAlive: s.isAlive, lastPulseAt: s.lastPulseAt });
      out.push({ ...cfg, lastPulseAt: s.lastPulseAt, gameStatus: game.status });
    }

    return out;
  }, [vcAgent, cbAgent, d3Agent, vcStatus.isAlive, vcStatus.lastPulseAt, cbStatus.isAlive, cbStatus.lastPulseAt, d3Status.isAlive, d3Status.lastPulseAt]);

  const desksById = useMemo(() => {
    const m: Record<string, string> = {};
    for (const d of desks) m[d.id] = d.name;
    return m;
  }, [desks]);

  const [statusResp, setStatusResp] = useState<StatusResponse | null>(null);
  const [feedEvents, setFeedEvents] = useState<FeedResponse["events"]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardResponse["leaderboard"]>([]);
  const [myWatches, setMyWatches] = useState<MyWatch[]>([]);
  const [busyDesk, setBusyDesk] = useState<string | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [deathModal, setDeathModal] = useState<{ deskId: DeskId; rewardUsd: string } | null>(null);
  const [isNarrow, setIsNarrow] = useState(false);
  const lastFeedSinceRef = useRef<number>(0);
  const recordedDeathsRoundRef = useRef<string | null>(null);
  const recordedDeathsRef = useRef<Set<string>>(new Set());

  const liveCount = useMemo(() => desks.filter((d) => d.gameStatus === "active").length, [desks]);

  const refreshStatus = useCallback(async () => {
    const res = await fetch("/api/watch/status", { method: "GET" });
    const data = (await res.json().catch(() => null)) as StatusResponse | null;
    if (!res.ok || !data) return;
    setStatusResp(data);
  }, []);

  const refreshLeaderboard = useCallback(async () => {
    const res = await fetch("/api/watch/leaderboard", { method: "GET" });
    const data = (await res.json().catch(() => null)) as LeaderboardResponse | null;
    if (!res.ok || !data) return;
    setLeaderboard(data.leaderboard ?? []);
  }, []);

  const refreshFeed = useCallback(async () => {
    const since = lastFeedSinceRef.current;
    const res = await fetch(`/api/watch/feed?since=${since}`, { method: "GET" });
    const data = (await res.json().catch(() => null)) as FeedResponse | null;
    if (!res.ok || !data) return;
    if (data.events.length === 0) return;

    // Merge, keep newest first
    setFeedEvents((prev) => {
      const seen = new Set(prev.map((e) => e.id));
      const merged = [...data.events.filter((e) => !seen.has(e.id)), ...prev];
      return merged.slice(0, 60);
    });

    lastFeedSinceRef.current = Math.max(since, ...data.events.map((e) => e.createdAt));
  }, []);

  useEffect(() => {
    void refreshStatus();
    void refreshFeed();
    void refreshLeaderboard();

    const t = window.setInterval(() => {
      void refreshStatus();
      void refreshFeed();
    }, POLL_INTERVAL_MS);

    const lb = window.setInterval(() => {
      void refreshLeaderboard();
    }, 15_000);

    return () => {
      window.clearInterval(t);
      window.clearInterval(lb);
    };
  }, [refreshStatus, refreshFeed, refreshLeaderboard]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 980px)");
    const update = () => setIsNarrow(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  // Ensure we record a death event (server-side) once per round per desk.
  useEffect(() => {
    const roundId = statusResp?.round?.id ?? null;
    if (!roundId) return;
    if (recordedDeathsRoundRef.current !== roundId) {
      recordedDeathsRoundRef.current = roundId;
      recordedDeathsRef.current = new Set();
    }

    const deskStats = statusResp?.deskStats ?? {};
    for (const d of desks) {
      const watchers = deskStats[d.id]?.watchers ?? 0;
      const alreadyDead = deskStats[d.id]?.isDead ?? false;
      if (watchers <= 0) continue;
      if (alreadyDead) continue;
      if (d.gameStatus !== "dead") continue;
      if (recordedDeathsRef.current.has(d.id)) continue;

      recordedDeathsRef.current.add(d.id);
      void fetch("/api/watch/detect-death", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deskId: d.id,
          lastPulseAt: d.lastPulseAt ?? 0,
          ttlMs: GAME_TTL_MS,
        }),
      }).catch(() => null);
    }
  }, [statusResp?.round?.id, statusResp?.deskStats, desks]);

  // Open modal when a desk is dead and the connected wallet has an unclaimed watch.
  useEffect(() => {
    if (!address || !statusResp) return;
    const stats = statusResp.deskStats ?? {};
    for (const w of myWatches) {
      if (w.claimed) continue;
      const st = stats[w.deskId];
      if (!st?.isDead || !st.deathId) continue;
      const pool = BigInt(st.poolAtomic || "0");
      const totalWeight = BigInt(st.totalWeight || 0);
      const rewardPool = (pool * 2n * 9000n) / 10_000n; // matches server: 2x pool, 10% protocol cut
      const myWeight = BigInt(w.multiplier || 1);
      const estAtomic = totalWeight > 0n ? (rewardPool * myWeight) / totalWeight : 0n;
      const rewardUsd = formatUsdFromMicro(estAtomic);

      setDeathModal((cur) => (cur?.deskId === w.deskId ? { ...cur, rewardUsd } : { deskId: w.deskId, rewardUsd }));
    }
  }, [address, statusResp, myWatches, desksById]);

  // Maintain heartbeat sparklines derived from lastPulseAt (non-authoritative visualization).
  const [sparks, setSparks] = useState<Record<string, number[]>>(() => {
    const init: Record<string, number[]> = {};
    for (const d of desks) {
      init[d.id] = Array.from({ length: 50 }, () => 20 + Math.random() * 60);
    }
    return init;
  });

  useEffect(() => {
    // Ensure new desks get a sparkline.
    setSparks((prev) => {
      const next = { ...prev };
      for (const d of desks) {
        if (!next[d.id]) next[d.id] = Array.from({ length: 50 }, () => 20 + Math.random() * 60);
      }
      return next;
    });
  }, [desks]);

  useEffect(() => {
    const t = window.setInterval(() => {
      setSparks((prev) => {
        const next: Record<string, number[]> = { ...prev };
        for (const d of desks) {
          const arr = next[d.id] ?? Array.from({ length: 50 }, () => 20 + Math.random() * 60);
          const ageMs = d.lastPulseAt ? Date.now() - d.lastPulseAt * 1000 : GAME_TTL_MS * 2;
          const base = Math.max(0, 100 - (ageMs / GAME_TTL_MS) * 100);
          const noise = (Math.random() - 0.5) * 14;
          const spike = Math.random() > 0.86 ? 30 + Math.random() * 25 : 0;
          const v = Math.max(0, Math.min(100, base + noise + spike));
          next[d.id] = [...arr.slice(1), v];
        }
        return next;
      });
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(t);
  }, [desks]);

  const canPay = useMemo(() => {
    // /api/watch/subscribe uses the paid x402 gate which is Base mainnet-only.
    return String(chainId) === "8453" && String(publicEnv.chainId || "") === "8453";
  }, [chainId]);

  const subscribe = useCallback(
    async (deskId: DeskId, tier: WatchTier) => {
      setGlobalError(null);
      if (!address || !walletClient) {
        setGlobalError("Connect wallet to watch");
        return;
      }
      if (!canPay) {
        setGlobalError("Switch to Base mainnet to watch");
        return;
      }

      setBusyDesk(deskId);
      try {
        const body = { deskId, tier: tier.id };
        let res = await fetch("/api/watch/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (res.status === 402) {
          const challenge = (await res.json().catch(() => null)) as { accepts?: X402Accept[]; error?: string } | null;
          const accept = challenge?.accepts?.[0];
          if (!accept) {
            throw new Error(challenge?.error || "Missing x402 requirements");
          }

          const paymentHeader = await createX402ExactPaymentHeader({
            accept,
            walletClient,
            from: address as `0x${string}`,
          });

          res = await fetch("/api/watch/subscribe", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-PAYMENT": paymentHeader,
            },
            body: JSON.stringify(body),
          });
        }

        const data = (await res.json().catch(() => null)) as { success?: boolean; error?: string } | null;
        if (!res.ok || !data?.success) {
          throw new Error(data?.error || `Subscribe failed (${res.status})`);
        }

        setMyWatches((prev) => [
          ...prev,
          {
            deskId,
            tier: tier.id,
            costUsd: tier.costUsd,
            multiplier: tier.multiplier,
            createdAt: Date.now(),
            claimed: false,
          },
        ]);

        // Refresh status immediately to reflect watcher/pool updates.
        void refreshStatus();
        void refreshFeed();
        void refreshLeaderboard();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setGlobalError(msg);
      } finally {
        setBusyDesk(null);
      }
    },
    [address, walletClient, canPay, refreshStatus, refreshFeed, refreshLeaderboard],
  );

  const claim = useCallback(
    async (deskId: DeskId) => {
      setGlobalError(null);
      if (!address || !statusResp) return;
      const deathId = statusResp.deskStats?.[deskId]?.deathId;
      if (!deathId) return;

      setBusyDesk(deskId);
      try {
        const res = await fetch("/api/watch/claim", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deathId, wallet: address }),
        });
        const data = (await res.json().catch(() => null)) as { success?: boolean; rewardAtomic?: string; error?: string } | null;
        if (!res.ok || !data?.success || !data.rewardAtomic) {
          throw new Error(data?.error || `Claim failed (${res.status})`);
        }

        setMyWatches((prev) =>
          prev.map((w) =>
            w.deskId === deskId ? { ...w, claimed: true, claimedRewardAtomic: data.rewardAtomic } : w,
          ),
        );

        setDeathModal(null);
        void refreshStatus();
        void refreshFeed();
        void refreshLeaderboard();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setGlobalError(msg);
      } finally {
        setBusyDesk(null);
      }
    },
    [address, statusResp, refreshStatus, refreshFeed, refreshLeaderboard],
  );

  return (
    <div style={{ minHeight: "100vh", background: "#08090c", color: "#eee", fontFamily: "'JetBrains Mono', monospace" }}>
      <style>{`
        @keyframes pulseRing { 0% { transform: scale(0.8); opacity: 0.5; } 100% { transform: scale(2); opacity: 0; } }
        @keyframes fadeSlideIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes deathPulse { 0%, 100% { opacity: 0.3; transform: scale(1); } 50% { opacity: 0.6; transform: scale(1.3); } }
        @keyframes deathGlow { 0%, 100% { box-shadow: 0 0 0 rgba(255,51,85,0); } 50% { box-shadow: 0 0 20px rgba(255,51,85,0.2); } }
        @keyframes deathScan { from { background-position: 0 0; } to { background-position: 28px 28px; } }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
      `}</style>

      {/* Ambient bg */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 0,
          pointerEvents: "none",
          background:
            "radial-gradient(ellipse at 20% 0%, rgba(0,255,136,0.03) 0%, transparent 60%), radial-gradient(ellipse at 80% 100%, rgba(136,170,255,0.02) 0%, transparent 60%), radial-gradient(ellipse at 50% 50%, rgba(255,51,85,0.01) 0%, transparent 40%)",
        }}
      />

      {/* Death modal */}
      {deathModal && (
        <DeathModal
          deskName={desksById[deathModal.deskId] ?? deathModal.deskId}
          rewardUsd={deathModal.rewardUsd}
          onClaim={() => void claim(deathModal.deskId)}
          onClose={() => setDeathModal(null)}
          busy={busyDesk === deathModal.deskId}
        />
      )}

      <div style={{ position: "relative", zIndex: 1, maxWidth: 1280, margin: "0 auto", padding: "40px 32px" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: "linear-gradient(135deg, #00ff88 0%, #00cc66 100%)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 0 24px rgba(0,255,136,0.3)",
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#08090c" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M4 12h4l3-9 4 18 3-9h4" />
                </svg>
              </div>
              <span
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 22,
                  fontWeight: 900,
                  letterSpacing: "-0.02em",
                  background: "linear-gradient(135deg, #00ff88, #88ffcc)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                DESK WATCH
              </span>
              <span
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 10,
                  color: "#444",
                  background: "rgba(255,255,255,0.04)",
                  padding: "4px 10px",
                  borderRadius: 20,
                  border: "1px solid rgba(255,255,255,0.06)",
                  letterSpacing: "0.05em",
                }}
              >
                AGENT PULSE · BASE
              </span>
              <span
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 10,
                  color: "#ff3355",
                  background: "rgba(255,51,85,0.08)",
                  padding: "4px 10px",
                  borderRadius: 20,
                  border: "1px solid rgba(255,51,85,0.15)",
                  letterSpacing: "0.05em",
                  animation: "deathPulse 2s ease-in-out infinite",
                }}
              >
                LIVE
              </span>
            </div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: "#666", maxWidth: 700, lineHeight: 1.5 }}>
              Watch live agent desks. Choose a tier. If a desk misses the TTL window during the round, watchers can claim from the pool.
              Each watch is an x402 USDC micropayment on Base.
            </div>
            {!vcAgent && !cbAgent && !d3Agent && (
              <div style={{ marginTop: 10, fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#ff3355" }}>
                Configure desk agent addresses in env vars: `NEXT_PUBLIC_DESK_WATCH_DESK_*_AGENT`
              </div>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-end" }}>
            <ConnectButton showBalance={false} chainStatus="icon" accountStatus="address" />
            {isConnected && !canPay && (
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "#ffaa00" }}>
                Base mainnet required for x402 watch flow
              </div>
            )}
          </div>
        </div>

        {globalError && (
          <div
            style={{
              marginBottom: 16,
              padding: "12px 14px",
              background: "rgba(255,51,85,0.08)",
              border: "1px solid rgba(255,51,85,0.2)",
              borderRadius: 12,
              color: "#ff3355",
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 12,
            }}
          >
            {globalError}
          </div>
        )}

        {/* Round Timer */}
        {statusResp?.round?.startedAt && statusResp.round.endsAt && (
          <div style={{ marginBottom: 20 }}>
            <RoundTimer startedAt={statusResp.round.startedAt} endsAt={statusResp.round.endsAt} />
          </div>
        )}

        {/* Network Stats */}
        <NetworkStats
          liveCount={liveCount}
          totalDesks={desks.length}
          totals={statusResp?.totals ?? null}
          isNarrow={isNarrow}
        />

        {/* Watch Panel */}
        <WatchPanel myWatches={myWatches} desks={desks} />

        {/* Desk Grid */}
        <div style={{ display: "grid", gridTemplateColumns: isNarrow ? "1fr" : "1fr 1fr", gap: 16, marginBottom: 28 }}>
          {desks.map((d) => {
            const st = statusResp?.deskStats?.[d.id];
            const watchers = st?.watchers ?? 0;
            const poolAtomic = st?.poolAtomic ?? "0";
            const mine = myWatches.find((w) => w.deskId === d.id);
            return (
              <DeskCard
                key={d.id}
                desk={d}
                status={d.gameStatus}
                lastPulseAt={d.lastPulseAt}
                heartbeats={sparks[d.id] ?? Array.from({ length: 50 }, () => 30)}
                watchers={watchers}
                poolAtomic={poolAtomic}
                myWatch={mine}
                walletConnected={Boolean(isConnected)}
                busy={busyDesk === d.id}
                onWatch={(tier) => void subscribe(d.id, tier)}
                onClaim={() => void claim(d.id)}
              />
            );
          })}
        </div>

        {/* Leaderboard + Event Log */}
        <div style={{ display: "grid", gridTemplateColumns: isNarrow ? "1fr" : "1fr 1.6fr", gap: 16, marginBottom: 28 }}>
          <Leaderboard entries={leaderboard} />
          <EventLog events={feedEvents} desksById={desksById} />
        </div>

        {/* How it works */}
        <div
          style={{
            background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 16,
            padding: "28px 32px",
            marginBottom: 24,
          }}
        >
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#555", letterSpacing: "0.1em", marginBottom: 20 }}>
            HOW IT WORKS
          </div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            {[
              { icon: "👀", title: "1. Watch", desc: "Pick a desk and tier. The watch call is an x402 USDC micropayment." },
              { icon: "💓", title: "2. Wait", desc: "Desks pulse heartbeats via Agent Pulse. The UI shows the latest pulse age." },
              { icon: "💀", title: "3. Missed TTL", desc: "If the desk exceeds the TTL window inside a round, a death event is recorded." },
              { icon: "💰", title: "4. Claim", desc: "Watchers can claim from the pool. Higher tiers have larger weight." },
            ].map((step) => (
              <div key={step.title} style={{ flex: "1 1 220px", textAlign: "center" }}>
                <div style={{ fontSize: 28, marginBottom: 10 }}>{step.icon}</div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 900, color: "#ddd", marginBottom: 6 }}>
                  {step.title}
                </div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#666", lineHeight: 1.5 }}>
                  {step.desc}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div
          style={{
            marginTop: 16,
            padding: "20px 0",
            borderTop: "1px solid rgba(255,255,255,0.04)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "#333", letterSpacing: "0.08em" }}>
            DESK WATCH · x402 · BASE
          </div>
        </div>
      </div>
    </div>
  );
}
