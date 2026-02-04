export const serverEnv = {
  baseRpcUrl: process.env.BASE_RPC_URL ?? "",
  pulseTokenAddress: process.env.PULSE_TOKEN_ADDRESS ?? "",
  signalSinkAddress: process.env.SIGNAL_SINK_ADDRESS ?? "",
  inboxKeyTtlSeconds: process.env.INBOX_KEY_TTL_SECONDS ?? "",
  blockTimeSeconds: process.env.BLOCK_TIME_SECONDS ?? "",
  aliveWindowSeconds: process.env.ALIVE_WINDOW_SECONDS ?? "",
  blockConfirmations: process.env.BLOCK_CONFIRMATIONS ?? "",
  privateKey: process.env.PRIVATE_KEY ?? "",
  etherscanApiKey: process.env.ETHERSCAN_API_KEY ?? "",
  kvUrl: process.env.KV_URL ?? "",
  kvRestApiUrl: process.env.KV_REST_API_URL ?? "",
  kvRestApiToken: process.env.KV_REST_API_TOKEN ?? "",
};
