/** Read and trim a NEXT_PUBLIC_* env var (guards against stray newlines in Vercel config).
 *
 * IMPORTANT: Each env var MUST use literal `process.env.NEXT_PUBLIC_CHAIN_ID`-style access.
 * Dynamic bracket access (process.env[key]) breaks Next.js client-side inlining
 * because Next.js replaces literal references at build time via static analysis.
 */
export const publicEnv = {
  networkLabel: (process.env.NEXT_PUBLIC_NETWORK_LABEL ?? "").trim(),
  chainId: (process.env.NEXT_PUBLIC_CHAIN_ID ?? "").trim(),
  walletConnectProjectId: (process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID ?? "").trim(),
  treasurySafeAddress: (process.env.NEXT_PUBLIC_TREASURY_SAFE_ADDRESS ?? "").trim(),
  signalSinkAddress: (process.env.NEXT_PUBLIC_SIGNAL_SINK_ADDRESS ?? "").trim(),
  reputationRegistryAddress: (process.env.NEXT_PUBLIC_REPUTATION_REGISTRY_ADDRESS ?? "").trim(),
  pulseTokenAddress: (process.env.NEXT_PUBLIC_PULSE_TOKEN_ADDRESS ?? "").trim(),
  pulseRegistryAddress: (process.env.NEXT_PUBLIC_PULSE_REGISTRY_ADDRESS ?? "").trim(),
  identityRegistryAddress: (process.env.NEXT_PUBLIC_IDENTITY_REGISTRY_ADDRESS ?? "").trim(),
  baseRpcUrl: (process.env.NEXT_PUBLIC_BASE_RPC_URL ?? "").trim(),
  erc8004RegisterUrl: (process.env.NEXT_PUBLIC_ERC8004_REGISTER_URL ?? "").trim(),
  pulseFeedUrl: (process.env.NEXT_PUBLIC_PULSE_FEED_URL ?? "").trim(),
  explorerTxBaseUrl: (process.env.NEXT_PUBLIC_EXPLORER_TX_BASE_URL ?? "").trim(),
  lastRunStatus: (process.env.NEXT_PUBLIC_LAST_RUN_STATUS ?? "").trim(),
  lastRunTs: (process.env.NEXT_PUBLIC_LAST_RUN_TS ?? "").trim(),
  lastRunNetwork: (process.env.NEXT_PUBLIC_LAST_RUN_NETWORK ?? "").trim(),
  lastRunLog: (process.env.NEXT_PUBLIC_LAST_RUN_LOG ?? "").trim(),
  lastRunLabel: (process.env.NEXT_PUBLIC_LAST_RUN_LABEL ?? "").trim(),
  aliveWindowSeconds: (process.env.NEXT_PUBLIC_ALIVE_WINDOW_SECONDS ?? "").trim(),
  inboxKeyTtlSeconds: (process.env.NEXT_PUBLIC_INBOX_KEY_TTL_SECONDS ?? "").trim(),
  deskWatchDeskVcAgent: (process.env.NEXT_PUBLIC_DESK_WATCH_DESK_VC_AGENT ?? "").trim(),
  deskWatchDeskCbAgent: (process.env.NEXT_PUBLIC_DESK_WATCH_DESK_CB_AGENT ?? "").trim(),
  deskWatchDesk03Agent: (process.env.NEXT_PUBLIC_DESK_WATCH_DESK_03_AGENT ?? "").trim(),
  deskWatchGameAddress: (process.env.NEXT_PUBLIC_DESK_WATCH_GAME_ADDRESS ?? "").trim(),
  deskWatchLensAddress: (process.env.NEXT_PUBLIC_DESK_WATCH_LENS_ADDRESS ?? "").trim(),
};
