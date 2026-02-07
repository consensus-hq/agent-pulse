"use client";

import { useState, useCallback } from "react";
import { useAccount } from "wagmi";
import { base } from "viem/chains";
import styles from "../page.module.css";

/**
 * Portfolio data from HeyElsa (matches actual API response shape)
 */
interface HeyElsaPortfolio {
  success?: boolean;
  wallet_address: string;
  network?: string;
  total_value_usd?: string;
  chains?: string[];
  portfolio: {
    balances: Array<{
      /** HeyElsa uses 'asset' for token symbol */
      asset: string;
      /** Legacy: some responses include symbol */
      symbol?: string;
      chain: string;
      balance: number | string;
      balance_usd: number | string;
      logo_url?: string | null;
      is_trash?: boolean;
      token_metadata?: {
        symbol: string;
        address: string;
        chain: string;
        decimals: number;
        price_usd: number;
      };
      /** Legacy fields for backward compat */
      name?: string;
      address?: string;
      priceUSD?: string;
      valueUSD?: string;
    }>;
    defi_positions?: unknown[];
    staking_positions?: unknown[];
  };
}

interface PortfolioError {
  type: "NO_WALLET" | "WRONG_NETWORK" | "SERVER_ERROR" | "NETWORK_ERROR" | "UNKNOWN";
  message: string;
}

interface UsePortfolioResult {
  data: HeyElsaPortfolio | null;
  loading: boolean;
  error: PortfolioError | null;
  lastUpdated: Date | null;
  isCached: boolean;
  refresh: (force?: boolean) => Promise<void>;
}

/**
 * Hook to fetch portfolio from our server-side proxy
 * No x402 client-side code needed - server handles all payments
 */
function usePortfolio(): UsePortfolioResult {
  const { address, isConnected, chainId } = useAccount();
  
  const [data, setData] = useState<HeyElsaPortfolio | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<PortfolioError | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isCached, setIsCached] = useState(false);

  const isCorrectNetwork = chainId === base.id;

  const refresh = useCallback(async (force = false) => {
    if (!address) {
      setError({ type: "NO_WALLET", message: "Connect your wallet to view DeFi positions" });
      return;
    }

    if (!isCorrectNetwork) {
      setError({ 
        type: "WRONG_NETWORK", 
        message: `Please switch to Base network (current: chain ${chainId ?? "unknown"})` 
      });
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/defi?action=portfolio&address=${address}`,
        {
          method: "GET",
          headers: { "Accept": "application/json" },
          // Add cache-busting if forcing refresh
          ...(force && { cache: "no-store" }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        
        if (response.status === 503) {
          throw new Error(errorData.message || "HeyElsa service unavailable");
        }
        
        throw new Error(errorData.message || `Server error: ${response.status}`);
      }

      const result = await response.json();
      
      setData(result);
      setLastUpdated(new Date());
      setIsCached(result._cached === true);
    } catch (err) {
      console.error("Failed to fetch portfolio:", err);
      
      const message = err instanceof Error ? err.message : String(err);
      
      if (message.includes("HeyElsa") || message.includes("503")) {
        setError({
          type: "SERVER_ERROR",
          message: "HeyElsa data service is temporarily unavailable. Please try again later.",
        });
      } else if (message.includes("network") || message.includes("fetch")) {
        setError({
          type: "NETWORK_ERROR",
          message: "Network error. Please check your connection and try again.",
        });
      } else {
        setError({
          type: "UNKNOWN",
          message: message || "Failed to fetch portfolio data",
        });
      }
    } finally {
      setLoading(false);
    }
  }, [address, isCorrectNetwork, chainId]);

  return { data, loading, error, lastUpdated, isCached, refresh };
}

/**
 * Get user-friendly error message
 */
function getErrorDisplay(error: PortfolioError | null): {
  title: string;
  message: string;
} {
  if (!error) return { title: "", message: "" };

  switch (error.type) {
    case "NO_WALLET":
      return {
        title: "Wallet not connected",
        message: "Connect your wallet to view DeFi positions.",
      };
    case "WRONG_NETWORK":
      return {
        title: "Wrong network",
        message: "Please switch to Base network to fetch portfolio data.",
      };
    case "SERVER_ERROR":
      return {
        title: "Service unavailable",
        message: error.message,
      };
    case "NETWORK_ERROR":
      return {
        title: "Network error",
        message: "Unable to connect. Please check your internet connection.",
      };
    default:
      return {
        title: "Error",
        message: error.message || "Something went wrong fetching portfolio data.",
      };
  }
}

/**
 * DeFi Panel Component
 * 
 * Displays portfolio data from HeyElsa via server-side proxy.
 * 
 * Features:
 * - Server handles x402 payments (no wallet popups)
 * - 60-second server-side cache
 * - Clean error states
 * - "Powered by HeyElsa x402" attribution
 */
export default function DefiPanel() {
  const { isConnected, chainId } = useAccount();

  const { data, loading, error, lastUpdated, isCached, refresh } = usePortfolio();

  const isCorrectNetwork = chainId === base.id;

  const errorDisplay = getErrorDisplay(error);

  // Format portfolio value — compute from balances if total not provided
  const computedTotal = data?.portfolio?.balances
    ? data.portfolio.balances.reduce((sum, t) => sum + Number(t.balance_usd || t.valueUSD || 0), 0)
    : 0;
  const totalUsd = data?.total_value_usd ? parseFloat(data.total_value_usd) : computedTotal;
  const portfolioValue = totalUsd > 0
    ? `$${totalUsd.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`
    : null;

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>DeFi Portfolio</h2>
        <span className={styles.tag}>HeyElsa x402</span>
      </div>

      {/* Attribution */}
      <div
        style={{
          padding: "12px 16px",
          backgroundColor: "rgba(0, 123, 255, 0.1)",
          border: "1px solid rgba(0, 123, 255, 0.3)",
          borderRadius: "6px",
          marginBottom: "16px",
          fontSize: "0.85rem",
          color: "#aaa",
        }}
      >
        <span style={{ color: "#6af" }}>ℹ️</span> Portfolio data powered by{" "}
        <a 
          href="https://x402.heyelsa.ai" 
          target="_blank" 
          rel="noopener noreferrer"
          style={{ color: "#6af", textDecoration: "none" }}
        >
          HeyElsa x402
        </a>
        . Data refreshes every 60 seconds.
      </div>

      {/* Not connected state */}
      {!isConnected && (
        <div
          style={{
            padding: "24px",
            textAlign: "center",
            backgroundColor: "rgba(255, 255, 255, 0.03)",
            borderRadius: "8px",
          }}
        >
          <p className={styles.muted} style={{ marginBottom: "12px" }}>
            Connect your wallet to view DeFi positions
          </p>
          <p style={{ fontSize: "0.8rem", color: "#666" }}>
            Portfolio data requires a connected wallet on Base network
          </p>
        </div>
      )}

      {/* Connected but not on Base */}
      {isConnected && !isCorrectNetwork && (
        <div
          style={{
            padding: "16px",
            backgroundColor: "rgba(255, 193, 7, 0.1)",
            border: "1px solid rgba(255, 193, 7, 0.3)",
            borderRadius: "6px",
            marginBottom: "16px",
          }}
        >
          <p style={{ color: "#ffc107", marginBottom: "8px" }}>
            ⚠️ Wrong Network
          </p>
          <p className={styles.muted}>
            Please switch to Base network to fetch portfolio data.
            <br />
            Current: Chain {chainId ?? "unknown"}
          </p>
        </div>
      )}

      {/* Connected state */}
      {isConnected && isCorrectNetwork && (
        <>
          {/* Initial state - no data yet */}
          {!data && !loading && !error && (
            <div
              style={{
                padding: "24px",
                textAlign: "center",
                backgroundColor: "rgba(255, 255, 255, 0.03)",
                borderRadius: "8px",
              }}
            >
              <p className={styles.muted} style={{ marginBottom: "16px" }}>
                View your DeFi portfolio across multiple chains
              </p>
              <button
                className={styles.button}
                onClick={() => refresh()}
                disabled={loading}
              >
                View Portfolio
              </button>
            </div>
          )}

          {/* Loading state */}
          {loading && (
            <div style={{ padding: "24px" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  marginBottom: "16px",
                }}
              >
                <div
                  className={styles.loadingDot}
                  style={{ fontSize: "1.2rem" }}
                >
                  ⟳
                </div>
                <span className={styles.muted}>Fetching portfolio...</span>
              </div>
              {/* Skeleton loading */}
              <div>
                <SkeletonLine width="60%" />
                <SkeletonLine width="40%" />
                <SkeletonLine width="80%" />
                <SkeletonLine width="50%" />
              </div>
            </div>
          )}

          {/* Error state */}
          {error && !loading && (
            <div
              style={{
                padding: "16px",
                backgroundColor: "rgba(220, 53, 69, 0.1)",
                border: "1px solid rgba(220, 53, 69, 0.3)",
                borderRadius: "6px",
                marginBottom: "16px",
              }}
            >
              <p style={{ color: "#ff6b6b", marginBottom: "8px" }}>
                {errorDisplay.title}
              </p>
              <p className={styles.muted} style={{ marginBottom: "12px" }}>
                {errorDisplay.message}
              </p>
              <button
                className={styles.buttonGhost}
                onClick={() => refresh(true)}
                style={{ fontSize: "0.85rem" }}
              >
                Try Again
              </button>
            </div>
          )}

          {/* Success state - Portfolio data */}
          {data && !loading && (
            <div>
              {/* Total Value */}
              <div
                style={{
                  padding: "16px",
                  backgroundColor: "rgba(40, 167, 69, 0.1)",
                  borderRadius: "8px",
                  marginBottom: "16px",
                }}
              >
                <p className={styles.muted} style={{ fontSize: "0.85rem" }}>
                  Total Portfolio Value
                </p>
                <p
                  style={{
                    fontSize: "1.75rem",
                    fontWeight: 600,
                    color: "#28a745",
                  }}
                >
                  {portfolioValue}
                </p>
                {(data.chains?.length || data.network) && (
                  <p
                    style={{
                      fontSize: "0.8rem",
                      color: "#888",
                      marginTop: "4px",
                    }}
                  >
                    {data.chains?.length
                      ? `Across ${data.chains.join(", ")}`
                      : `Network: ${data.network}`}
                  </p>
                )}
              </div>

              {/* Token Holdings */}
              {data.portfolio?.balances &&
                data.portfolio.balances.length > 0 && (
                  <div style={{ marginBottom: "16px" }}>
                    <p
                      className={styles.sectionLabel}
                      style={{ marginBottom: "12px" }}
                    >
                      Token Holdings
                    </p>
                    <div
                      style={{
                        display: "grid",
                        gap: "8px",
                      }}
                    >
                      {data.portfolio.balances
                        .filter((t) => !t.is_trash)
                        .map((token) => {
                          const sym = token.asset || token.symbol || token.token_metadata?.symbol || "?";
                          const addr = token.token_metadata?.address || token.address || "";
                          const bal = Number(token.balance || 0);
                          const valUsd = Number(token.balance_usd || token.valueUSD || 0);
                          const priceUsd = token.token_metadata?.price_usd ?? parseFloat(token.priceUSD || "0");
                          const logoUrl = token.logo_url;
                          return (
                            <div
                              key={addr || sym}
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                padding: "12px",
                                backgroundColor: "rgba(255, 255, 255, 0.03)",
                                borderRadius: "6px",
                              }}
                            >
                              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                {logoUrl && (
                                  <img
                                    src={logoUrl}
                                    alt={sym}
                                    width={24}
                                    height={24}
                                    style={{ borderRadius: "50%" }}
                                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                                  />
                                )}
                                <div>
                                  <p style={{ fontWeight: 500 }}>{sym}</p>
                                  <p style={{ fontSize: "0.8rem", color: "#888" }}>
                                    {bal.toLocaleString("en-US", { maximumFractionDigits: 4 })} {sym}
                                  </p>
                                </div>
                              </div>
                              <div style={{ textAlign: "right" }}>
                                <p style={{ fontWeight: 500 }}>
                                  ${valUsd.toLocaleString("en-US", {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  })}
                                </p>
                                {priceUsd > 0 && (
                                  <p style={{ fontSize: "0.8rem", color: "#888" }}>
                                    @ ${priceUsd.toLocaleString("en-US", {
                                      minimumFractionDigits: 4,
                                      maximumFractionDigits: 6,
                                    })}
                                  </p>
                                )}
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}

              {/* Refresh button with cache status */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                  padding: "12px",
                  backgroundColor: "rgba(255, 255, 255, 0.02)",
                  borderRadius: "6px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <button
                    className={styles.button}
                    onClick={() => refresh(true)}
                    disabled={loading}
                  >
                    Refresh
                  </button>
                  {isCached && (
                    <span
                      style={{
                        fontSize: "0.8rem",
                        color: "#28a745",
                      }}
                    >
                      Cached
                    </span>
                  )}
                </div>
                {lastUpdated && (
                  <p className={styles.muted} style={{ fontSize: "0.75rem" }}>
                    Last updated: {lastUpdated.toLocaleTimeString()}
                  </p>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

/**
 * Skeleton loading line component
 */
function SkeletonLine({ width }: { width: string }) {
  return (
    <div
      style={{
        height: "16px",
        width,
        backgroundColor: "rgba(255, 255, 255, 0.1)",
        borderRadius: "4px",
        marginBottom: "12px",
        animation: "pulse 1.5s ease-in-out infinite",
      }}
    />
  );
}
