"use client";

import { useState, useEffect, useCallback } from "react";
import styles from "../page.module.css";
import { useWallet } from "../hooks/useWallet";

interface TokenHolding {
  symbol: string;
  balance: string;
  valueUsd: string;
  address?: string;
}

interface DefiData {
  pulsePrice?: string;
  priceChange24h?: string;
  portfolio?: {
    totalValue: string;
    tokens: TokenHolding[];
  };
  swapQuote?: {
    fromToken: string;
    fromAmount: string;
    toToken: string;
    toAmount: string;
    exchangeRate: string;
    slippage: string;
  };
}

interface DefiApiResponse {
  price?: string;
  priceChange24h?: string;
  portfolio?: {
    totalValue: string;
    tokens: Array<{
      symbol: string;
      balance: string;
      valueUsd: string;
      address?: string;
    }>;
  };
  swapQuote?: {
    fromToken: string;
    fromAmount: string;
    toToken: string;
    toAmount: string;
    exchangeRate: string;
    slippage: string;
  };
  error?: string;
}

const formatPrice = (price?: string) => {
  if (!price) return "—";
  const num = parseFloat(price);
  if (Number.isNaN(num)) return "—";
  return `$${num.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 6 })}`;
};

const formatChange = (change?: string) => {
  if (!change) return null;
  const num = parseFloat(change);
  if (Number.isNaN(num)) return null;
  const sign = num >= 0 ? "+" : "";
  return `${sign}${num.toFixed(2)}%`;
};

const formatUsd = (value?: string) => {
  if (!value) return "—";
  const num = parseFloat(value);
  if (Number.isNaN(num)) return "—";
  return `$${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export default function DefiPanel() {
  const { address, isConnected } = useWallet();
  const [defiData, setDefiData] = useState<DefiData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [swapLoading, setSwapLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchDefiData = useCallback(async () => {
    if (!isConnected || !address) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/defi?address=${address}`);
      const data: DefiApiResponse = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }
      
      setDefiData({
        pulsePrice: data.price,
        priceChange24h: data.priceChange24h,
        portfolio: data.portfolio,
        swapQuote: data.swapQuote,
      });
      setLastUpdated(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch DeFi data");
    } finally {
      setLoading(false);
    }
  }, [isConnected, address]);

  const fetchSwapQuote = useCallback(async () => {
    if (!isConnected || !address) return;
    
    setSwapLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/defi/swap?address=${address}&fromToken=USDC&toToken=PULSE&amount=100`);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }
      
      setDefiData(prev => ({
        ...prev,
        pulsePrice: data.price ?? prev?.pulsePrice,
        swapQuote: data.swapQuote,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch swap quote");
    } finally {
      setSwapLoading(false);
    }
  }, [isConnected, address]);

  // Auto-refresh every 30 seconds when connected
  useEffect(() => {
    if (!isConnected) return;
    
    void fetchDefiData();
    
    const interval = setInterval(() => {
      void fetchDefiData();
    }, 30000);
    
    return () => clearInterval(interval);
  }, [isConnected, address, fetchDefiData]);

  const changeValue = formatChange(defiData?.priceChange24h);
  const isPositiveChange = changeValue && changeValue.startsWith("+");
  const isNegativeChange = changeValue && changeValue.startsWith("-");

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>DeFi Panel</h2>
        <span className={styles.tag}>HeyElsa</span>
      </div>

      {!isConnected ? (
        <p className={styles.muted}>
          Connect a wallet to view your DeFi portfolio and PULSE price data.
        </p>
      ) : (
        <>
          {/* PULSE Price Section */}
          <div className={styles.panelSection}>
            <p className={styles.sectionLabel}>PULSE Token Price</p>
            <div className={styles.panelRow}>
              <span className={styles.value} style={{ fontSize: "20px", fontWeight: 500 }}>
                {formatPrice(defiData?.pulsePrice)}
              </span>
              {changeValue && (
                <span
                  className={
                    isPositiveChange
                      ? styles.successIndicator
                      : isNegativeChange
                      ? styles.errorIndicator
                      : styles.mutedIndicator
                  }
                >
                  {changeValue}
                </span>
              )}
              {loading && <span className={styles.loadingDot}>⟳</span>}
            </div>
            {lastUpdated && (
              <p className={styles.muted}>
                Last updated: {lastUpdated.toLocaleTimeString()}
              </p>
            )}
          </div>

          {/* Portfolio Section */}
          <div className={styles.panelSection}>
            <p className={styles.sectionLabel}>Portfolio Value</p>
            <div className={styles.panelRow}>
              <span className={styles.value} style={{ fontSize: "18px" }}>
                {formatUsd(defiData?.portfolio?.totalValue)}
              </span>
            </div>
            
            {defiData?.portfolio?.tokens && defiData.portfolio.tokens.length > 0 ? (
              <div className={styles.walletStats} style={{ marginTop: "12px" }}>
                {defiData.portfolio.tokens.map((token) => (
                  <div key={token.symbol}>
                    <p className={styles.walletLabel}>{token.symbol}</p>
                    <p className={styles.walletValue}>
                      {parseFloat(token.balance).toLocaleString("en-US", { maximumFractionDigits: 4 })} 
                      <span className={styles.muted}> ({formatUsd(token.valueUsd)})</span>
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className={styles.muted}>No token holdings found.</p>
            )}
          </div>

          {/* Swap Quote Section */}
          <div className={styles.panelSection}>
            <p className={styles.sectionLabel}>Swap Quote</p>
            {defiData?.swapQuote ? (
              <div className={styles.codeBlock} style={{ margin: "8px 0" }}>
                <div className={styles.panelRow}>
                  <span className={styles.label}>From:</span>
                  <span className={styles.value}>
                    {defiData.swapQuote.fromAmount} {defiData.swapQuote.fromToken}
                  </span>
                </div>
                <div className={styles.panelRow}>
                  <span className={styles.label}>To:</span>
                  <span className={styles.value}>
                    {defiData.swapQuote.toAmount} {defiData.swapQuote.toToken}
                  </span>
                </div>
                <div className={styles.panelRow}>
                  <span className={styles.label}>Rate:</span>
                  <span className={styles.value}>{defiData.swapQuote.exchangeRate}</span>
                </div>
                <div className={styles.panelRow}>
                  <span className={styles.label}>Slippage:</span>
                  <span className={styles.muted}>{defiData.swapQuote.slippage}</span>
                </div>
              </div>
            ) : (
              <p className={styles.muted}>Click &ldquo;Get PULSE&rdquo; to fetch a swap quote.</p>
            )}
            
            <div className={styles.row}>
              <button
                className={styles.button}
                onClick={fetchSwapQuote}
                disabled={swapLoading || !isConnected}
              >
                {swapLoading ? "Loading…" : "Get PULSE"}
              </button>
              <button
                className={styles.buttonGhost}
                onClick={() => void fetchDefiData()}
                disabled={loading}
              >
                Refresh
              </button>
            </div>
          </div>

          {/* Error Display */}
          {error && (
            <div className={styles.statusRow}>
              <span className={styles.errorIndicator}>✗</span>
              <span className={styles.error}>{error}</span>
            </div>
          )}
        </>
      )}
    </section>
  );
}
