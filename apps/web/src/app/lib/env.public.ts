/** Read and trim a NEXT_PUBLIC_* env var (guards against stray newlines in Vercel config). */
const env = (key: string): string => (process.env[key] ?? "").trim();

export const publicEnv = {
  networkLabel: env("NEXT_PUBLIC_NETWORK_LABEL"),
  chainId: env("NEXT_PUBLIC_CHAIN_ID"),
  walletConnectProjectId: env("NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID"),
  treasurySafeAddress: env("NEXT_PUBLIC_TREASURY_SAFE_ADDRESS"),
  signalSinkAddress: env("NEXT_PUBLIC_SIGNAL_SINK_ADDRESS"),
  reputationRegistryAddress: env("NEXT_PUBLIC_REPUTATION_REGISTRY_ADDRESS"),
  pulseTokenAddress: env("NEXT_PUBLIC_PULSE_TOKEN_ADDRESS"),
  pulseRegistryAddress: env("NEXT_PUBLIC_PULSE_REGISTRY_ADDRESS"),
  identityRegistryAddress: env("NEXT_PUBLIC_IDENTITY_REGISTRY_ADDRESS"),
  baseRpcUrl: env("NEXT_PUBLIC_BASE_RPC_URL"),
  erc8004RegisterUrl: env("NEXT_PUBLIC_ERC8004_REGISTER_URL"),
  pulseFeedUrl: env("NEXT_PUBLIC_PULSE_FEED_URL"),
  explorerTxBaseUrl: env("NEXT_PUBLIC_EXPLORER_TX_BASE_URL"),
  lastRunStatus: env("NEXT_PUBLIC_LAST_RUN_STATUS"),
  lastRunTs: env("NEXT_PUBLIC_LAST_RUN_TS"),
  lastRunNetwork: env("NEXT_PUBLIC_LAST_RUN_NETWORK"),
  lastRunLog: env("NEXT_PUBLIC_LAST_RUN_LOG"),
  lastRunLabel: env("NEXT_PUBLIC_LAST_RUN_LABEL"),
  aliveWindowSeconds: env("NEXT_PUBLIC_ALIVE_WINDOW_SECONDS"),
  inboxKeyTtlSeconds: env("NEXT_PUBLIC_INBOX_KEY_TTL_SECONDS"),
};
