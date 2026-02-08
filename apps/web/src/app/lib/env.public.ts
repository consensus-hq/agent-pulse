/** Read and trim a NEXT_PUBLIC_* env var (guards against stray newlines in Vercel config).
 *
 * IMPORTANT: Do not access env vars dynamically (e.g. process.env[key]). Next.js only
 * inlines NEXT_PUBLIC_* values for literal accesses like process.env.NEXT_PUBLIC_FOO.
 */
const trimEnv = (value: string | undefined): string => (value ?? "").trim();

export const publicEnv = {
  networkLabel: trimEnv(process.env.NEXT_PUBLIC_NETWORK_LABEL),
  chainId: trimEnv(process.env.NEXT_PUBLIC_CHAIN_ID),
  walletConnectProjectId: trimEnv(process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID),
  treasurySafeAddress: trimEnv(process.env.NEXT_PUBLIC_TREASURY_SAFE_ADDRESS),
  signalSinkAddress: trimEnv(process.env.NEXT_PUBLIC_SIGNAL_SINK_ADDRESS),
  reputationRegistryAddress: trimEnv(process.env.NEXT_PUBLIC_REPUTATION_REGISTRY_ADDRESS),
  pulseTokenAddress: trimEnv(process.env.NEXT_PUBLIC_PULSE_TOKEN_ADDRESS),
  pulseRegistryAddress: trimEnv(process.env.NEXT_PUBLIC_PULSE_REGISTRY_ADDRESS),
  identityRegistryAddress: trimEnv(process.env.NEXT_PUBLIC_IDENTITY_REGISTRY_ADDRESS),
  baseRpcUrl: trimEnv(process.env.NEXT_PUBLIC_BASE_RPC_URL),
  erc8004RegisterUrl: trimEnv(process.env.NEXT_PUBLIC_ERC8004_REGISTER_URL),
  pulseFeedUrl: trimEnv(process.env.NEXT_PUBLIC_PULSE_FEED_URL),
  explorerTxBaseUrl: trimEnv(process.env.NEXT_PUBLIC_EXPLORER_TX_BASE_URL),
  lastRunStatus: trimEnv(process.env.NEXT_PUBLIC_LAST_RUN_STATUS),
  lastRunTs: trimEnv(process.env.NEXT_PUBLIC_LAST_RUN_TS),
  lastRunNetwork: trimEnv(process.env.NEXT_PUBLIC_LAST_RUN_NETWORK),
  lastRunLog: trimEnv(process.env.NEXT_PUBLIC_LAST_RUN_LOG),
  lastRunLabel: trimEnv(process.env.NEXT_PUBLIC_LAST_RUN_LABEL),
  aliveWindowSeconds: trimEnv(process.env.NEXT_PUBLIC_ALIVE_WINDOW_SECONDS),
  inboxKeyTtlSeconds: trimEnv(process.env.NEXT_PUBLIC_INBOX_KEY_TTL_SECONDS),
};
