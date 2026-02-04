# Clanker / Clawnch deployments (Uniswap v4)

Summary (from Clanker docs):
- Clanker v4 deployments allocate initial liquidity into **Uniswap v4** (not Uniswap v3).
- Creator rewards accrue from the **initial Uniswap v4 LP**.
- For tokens created through the clanker.world frontend, creator rewards = 100% of initial LP fees.
- For tokens created through the @clanker bot on Farcaster, creator rewards = 80% of initial LP fees.
- Clanker protocol fee is fixed at 20% of LP fees.

Implication for this repo:
- Uniswap v3 factory scans and Aerodrome/Velodrome pool scans may return nothing even if a token is actively trading.
- Liquidity discovery and swap execution must target the **Uniswap v4 PoolManager + Clanker hook contracts**.

## Base Uniswap v4 deployments (from Uniswap docs)
- PoolManager: 0x498581ff718922c3f8e6a244956af099b2652b2b
- StateView: 0xa3c0c9b65bad0b08107aa264b0f3db444b867a71
- V4Quoter: 0x0d5e0f971ed27fbff6c2837bf31316121532048d
- PositionManager: 0x7c5f5a4bbd8fd63184577525326123b519429bdc
- Universal Router: 0x6ff5693b99212da76ad316178a184ab56d299b43

## Fork discovery + quoting
1) Start the fork:
   - `./scripts/start-base-fork.sh`
2) Run pool discovery + quote (PULSE address from `LINKS.md`):
   - `BASE_FORK_RPC=http://127.0.0.1:8545 PULSE_TOKEN_ADDRESS=0x... TOKEN_IN=<token-in-address> npx -y tsx scripts/fork-v4-pool-discovery.ts`
   - Optional: `TOKEN_OUT=<token-out-address> WETH_ADDRESS=<addr> USDC_ADDRESS=<addr> SCAN_BLOCK_SPAN=400000 EXACT_IN=...`

References:
- Token deployments: https://clanker.gitbook.io/clanker-documentation/general/token-deployments
- Creator rewards & fees: https://clanker.gitbook.io/clanker-documentation/general/creator-rewards-and-fees
- Deployed contracts: https://clanker.gitbook.io/clanker-documentation/references/deployed-contracts
- Uniswap v4 deployments: https://docs.uniswap.org/contracts/v4/deployments
