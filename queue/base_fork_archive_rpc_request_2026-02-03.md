Subject: Base fork needs archive RPC (historical state errors)

Quick heads-up: anvil fork on Base is failing getCode/reads for PoolManager/StateView/Quoter with “historical state ... is not available” (see /tmp/anvil-base-fork.log). start-base-fork.sh uses BASE_FORK_URL (default publicnode) and doesn’t set a fork block. Likely need an archive-capable RPC (Alchemy/Tenderly) or a fresh fork provider to proceed with v4 pool validation. If you can share a BASE_FORK_URL with archive support (or refresh Tenderly token/permissions), I can rerun the targeted pool discovery + quotes immediately.
