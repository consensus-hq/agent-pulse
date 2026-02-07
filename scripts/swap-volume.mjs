import { createWalletClient, createPublicClient, http, parseEther, formatEther, defineChain, erc20Abi, getContract } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';
import { Pool, Route, Trade, V4Planner, Actions } from '@uniswap/v4-sdk';
import { Trade as RouterTrade, SwapRouter, UniswapTrade, UniversalRouterVersion } from '@uniswap/universal-router-sdk';
import { Ether, Token, CurrencyAmount, TradeType, Percent } from '@uniswap/sdk-core';
import fs from 'fs';
import path from 'path';

// --- Configuration ---
const RPC_URL = process.env.BASE_RPC_URL || "https://mainnet.base.org";
const PULSE_ADDRESS = "0x21111B39A502335aC7e45c4574Dd083A69258b07";
const WETH_ADDRESS = "0x4200000000000000000000000000000000000006";
const UNIVERSAL_ROUTER = "0x6ff5693b99212da76ad316178a184ab56d299b43";
const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3";

// Clanker V4 Pool Details
const POOL_FEE = 8388608; // Dynamic fee flag 0x800000
const POOL_TICK_SPACING = 200; // Clanker V4 pool
const POOL_HOOK = "0xb429d62f8f3bffb98cdb9569533ea23bf0ba28cc"; // Clanker dynamic fee hook address

// Base Addresses for V4
const POOL_MANAGER = "0x498581ff718922c3f8e6a244956af099b2652b2b";
const STATE_VIEW = "0xa3c0c9b65bad0b08107aa264b0f3db444b867a71";

const PRIVATE_KEY_FILE = "/opt/fundbot/work/workspace-connie/secrets/wallets/connie.core-mainnet.key.json";

// --- Helpers ---

function getArgs() {
  const args = process.argv.slice(2);
  const amountIdx = args.indexOf('--amount');
  const dirIdx = args.indexOf('--direction');
  const roundsIdx = args.indexOf('--rounds');
  const dryRun = args.includes('--dry-run');

  if (amountIdx === -1 || dirIdx === -1) {
    console.error("Usage: node swap-volume.mjs --amount <ETH> --direction <buy|sell> [--rounds <N>] [--dry-run]");
    process.exit(1);
  }

  return {
    amount: args[amountIdx + 1],
    direction: args[dirIdx + 1],
    rounds: roundsIdx !== -1 ? parseInt(args[roundsIdx + 1]) : 1,
    dryRun
  };
}

async function loadAccount() {
  try {
    const keyData = JSON.parse(fs.readFileSync(PRIVATE_KEY_FILE, 'utf8'));
    const pk = keyData.privateKey.startsWith('0x') ? keyData.privateKey : `0x${keyData.privateKey}`;
    return privateKeyToAccount(pk);
  } catch (e) {
    console.error("Failed to load private key:", e.message);
    process.exit(1);
  }
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// --- Main ---

async function main() {
  const { amount, direction, rounds, dryRun } = getArgs();
  const account = await loadAccount();

  console.log(`🚀 Starting Swap Volume Script`);
  console.log(`   Direction: ${direction.toUpperCase()}`);
  console.log(`   Amount: ${amount} ETH (value)`);
  console.log(`   Rounds: ${rounds}`);
  console.log(`   Dry Run: ${dryRun}`);
  console.log(`   Wallet: ${account.address}`);

  const publicClient = createPublicClient({
    chain: base,
    transport: http(RPC_URL)
  });

  const walletClient = createWalletClient({
    account,
    chain: base,
    transport: http(RPC_URL)
  });

  // 1. Setup Tokens
  const chainId = 8453;
  const ETH = Ether.onChain(chainId);
  const WETH = new Token(chainId, WETH_ADDRESS, 18, 'WETH', 'Wrapped Ether');
  const PULSE = new Token(chainId, PULSE_ADDRESS, 18, 'PULSE', 'Agent Pulse');

  // 2. Setup Pool
  // Sort currencies for PoolKey
  const sorted = WETH.sortsBefore(PULSE);
  const currency0 = sorted ? WETH : PULSE;
  const currency1 = sorted ? PULSE : WETH;

  // Verify Liquidity
  const stateViewAbi = [
    "function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)",
    "function getLiquidity(bytes32 poolId) view returns (uint128 liquidity)"
  ];
  const stateView = getContract({ address: STATE_VIEW, abi: stateViewAbi, client: publicClient });

  const poolKey = {
    currency0: currency0.address,
    currency1: currency1.address,
    fee: POOL_FEE,
    tickSpacing: POOL_TICK_SPACING,
    hooks: POOL_HOOK
  };

  const poolId = Pool.getPoolId(currency0, currency1, POOL_FEE, POOL_TICK_SPACING, POOL_HOOK);
  console.log(`   Pool ID: ${poolId}`);

  let slot0, liquidity;
  try {
    slot0 = await stateView.read.getSlot0([poolId]);
    liquidity = await stateView.read.getLiquidity([poolId]);
  } catch (e) {
    console.error("❌ Failed to fetch pool data. Pool might not be initialized or parameters are wrong.");
    // Fallback/Retry with different TickSpacing if needed? For now, fail hard.
    console.error(e);
    process.exit(1);
  }

  if (liquidity === 0n) {
    console.error("❌ Pool has NO LIQUIDITY. Cannot swap.");
    process.exit(1);
  }

  console.log(`   Liquidity: ${liquidity.toString()}`);
  console.log(`   SqrtPrice: ${slot0[0].toString()}`);

  const v4Pool = new Pool(
    currency0,
    currency1,
    POOL_FEE,
    POOL_TICK_SPACING,
    POOL_HOOK,
    slot0[0].toString(),
    liquidity.toString(),
    Number(slot0[1])
  );

  // 3. Execution Loop
  for (let i = 0; i < rounds; i++) {
    console.log(`\n🔄 Round ${i + 1}/${rounds}`);

    try {
      let trade;
      let inputAmountVal; 

      if (direction === 'buy') {
        // Buy: ETH -> PULSE (Exact Input)
        // SwapRouter handles ETH wrapping automatically if we use Ether as input currency
        inputAmountVal = parseEther(amount);
        const amountIn = CurrencyAmount.fromRawAmount(ETH, inputAmountVal.toString());
        
        const route = new Route([v4Pool], ETH, PULSE);
        trade = await Trade.fromRoute(route, amountIn, TradeType.EXACT_INPUT);

      } else if (direction === 'sell') {
        // Sell: PULSE -> ETH (Exact Output)
        // We want to receive `amount` ETH. 
        // This ensures the value traded is consistent with the flag.
        const outAmountVal = parseEther(amount);
        const amountOut = CurrencyAmount.fromRawAmount(ETH, outAmountVal.toString());

        const route = new Route([v4Pool], PULSE, ETH);
        trade = await Trade.fromRoute(route, amountOut, TradeType.EXACT_OUTPUT);
        
        // For sells, we need to approve Permit2 if using Universal Router
        if (!dryRun) {
            // Check allowance
            const erc20 = getContract({ address: PULSE_ADDRESS, abi: erc20Abi, client: publicClient });
            const allowance = await erc20.read.allowance([account.address, PERMIT2_ADDRESS]);
            const maxIn = BigInt(trade.maximumAmountIn(new Percent(5, 100)).quotient.toString());
            
            if (allowance < maxIn) {
                console.log(`   Approving Permit2...`);
                const hash = await walletClient.writeContract({
                    address: PULSE_ADDRESS,
                    abi: erc20Abi,
                    functionName: 'approve',
                    args: [PERMIT2_ADDRESS, maxIn * 10n], // Approve 10x to save gas on loops
                    account
                });
                await publicClient.waitForTransactionReceipt({ hash });
                console.log(`   Approved: ${hash}`);
                
                // Also need to Permit allowance on Permit2 for the Router? 
                // Universal Router pulls from Permit2. 
                // We need to 'approve' the router on Permit2 (allowance transfer)
                // Actually standard approve to Permit2 + Permit2 signature passed to router OR standard approve Permit2 + Router allowance on Permit2
                // Universal Router V2 uses Permit2. 
                // Simple flow: User -> Approve -> Permit2. 
                // Router calls Permit2.transferFrom(User, Router, amount).
                // This requires User to have approved Permit2 (done above) AND issued a distinct allowance to Router via Permit2.approve() function.
                // WAIT: Permit2 design allows "allowance" based transfer if the spender is approved.
                // Let's check allowance on Permit2 for Router.
                
                const permit2Abi = [
                    "function allowance(address user, address token, address spender) view returns (uint160 amount, uint48 expiration, uint48 nonce)",
                    "function approve(address token, address spender, uint160 amount, uint48 expiration) external"
                ];
                const permit2 = getContract({ address: PERMIT2_ADDRESS, abi: permit2Abi, client: publicClient });
                const [pAmount, pExp, pNonce] = await permit2.read.allowance([account.address, PULSE_ADDRESS, UNIVERSAL_ROUTER]);
                
                if (pAmount < maxIn) {
                     console.log(`   Approving Router on Permit2...`);
                     const hash2 = await walletClient.writeContract({
                        address: PERMIT2_ADDRESS,
                        abi: permit2Abi,
                        functionName: 'approve',
                        args: [PULSE_ADDRESS, UNIVERSAL_ROUTER, 2n**160n - 1n, 2n**48n - 1n],
                        account
                     });
                     await publicClient.waitForTransactionReceipt({ hash: hash2 });
                     console.log(`   Router Approved on Permit2: ${hash2}`);
                }
            }
        }
      } else {
        throw new Error("Invalid direction");
      }

      // Encode Trade
      // UniswapTrade wraps the router-sdk trade which wraps the v4-sdk trade
      const routerTrade = new UniswapTrade(
        new RouterTrade({ v2Routes: [], v3Routes: [], mixedRoutes: [], tradeType: trade.tradeType }), 
        {
            slippageTolerance: new Percent(5, 100), // 5%
            recipient: account.address
        }
      );
      
      // HACK: Construct UniswapTrade manually or use the underlying SwapRouter directly?
      // universal-router-sdk documentation says to import Trade from router-sdk.
      // But we have a V4 Trade.
      // We need to bypass the strict typing or wrap it correctly.
      // The `UniswapTrade` class expects a `RouterSDK.Trade`. 
      // `RouterSDK.Trade` constructor takes routes.
      // We can inject our V4 route into it.
      
      const opts = {
        slippageTolerance: new Percent(5, 100),
        recipient: account.address,
        deadline: BigInt(Math.floor(Date.now() / 1000) + 1800),
      };

      // V4 specific encoding via SwapRouter
      // Universal Router SDK's SwapRouter.swapCallParameters accepts a Trade object.
      // We can use the V4Planner manually if the SDK wrapper is too strict, but let's try to use the SDK.
      // The SDK supports V4. We just need to pass the right object.
      
      // Let's rely on the fact that we can construct the call parameters manually if needed, 
      // but simpler: use the trade we built.
      // The issue: `UniswapTrade` constructor takes a `RouterTrade`.
      // `RouterTrade` expects (v2/v3/mixed). It might not natively support V4-only routes in the version I have?
      // Wait, I saw `addV4Swap` in the source code I read.
      // So `UniswapTrade` DOES support V4.
      // I need to create a `RouterTrade` that contains my V4 route.
      // `RouterTrade` constructor: `{ v2Routes, v3Routes, mixedRoutes, tradeType }`
      // It doesn't seem to have `v4Routes` in the constructor args in older versions?
      // Let's check `node_modules/@uniswap/router-sdk/dist/entities/trade.d.ts` if possible.
      // Actually, I'll assume I can just use `SwapRouter.swapCallParameters` with the V4 trade directly if I cast it?
      // No, `swapCallParameters` expects `UniswapTrade`.
      
      // WORKAROUND: We will build the V4Planner commands manually since we have `v4-sdk`.
      // This avoids the complexity of wrapping the trade object into the router-sdk structure which might be picky.
      
      const planner = new V4Planner();
      // Add the trade to the planner
      // V4Planner.addTrade(trade, options...)
      // NOTE: universal-router-sdk exports V4Planner (it re-exports from v4-sdk or defines its own).
      // The `V4Planner` I imported from `@uniswap/v4-sdk` is the source.
      
      planner.addTrade(trade, opts.slippageTolerance);
      
      // If we are buying (Exact Input ETH -> PULSE), we are sending ETH.
      // V4Pool is WETH/PULSE.
      // Route is ETH -> PULSE.
      // The V4Planner `addTrade` handles the logic?
      // V4Planner logic: 
      // "addTrade" -> "addSwapAction" -> "Actions.SWAP_EXACT_IN/OUT".
      // It uses `currencyAddress(currency)` which maps native to zero address.
      // If the pool is WETH/PULSE, but we input ETH (native), the V4 Router (Universal Router) handles it?
      // No, Universal Router has specific commands for wrapping.
      // If I use `V4Planner` directly, it produces V4 actions.
      // I need to wrap those actions in a Universal Router command.
      // CommandType.V4_SWAP = 0x10.
      
      // The `UniversalRouter` needs a plan.
      // Plan:
      // 1. If ETH in: `WRAP_ETH`? No, V4 supports native ETH if the pool supports it.
      // BUT our pool uses WETH (0x4200...). It is NOT a native pool.
      // So we MUST wrap ETH to WETH first.
      
      // Manual Plan Construction:
      // Direction: BUY (ETH -> PULSE)
      // 1. WRAP_ETH (ETH -> WETH)
      // 2. V4_SWAP (WETH -> PULSE)
      
      // Direction: SELL (PULSE -> ETH)
      // 1. PERMIT2_TRANSFER_FROM (PULSE -> Router) (Handled by router execution if encoded)
      // 2. V4_SWAP (PULSE -> WETH)
      // 3. UNWRAP_WETH (WETH -> ETH)
      
      // We can use `SwapRouter.swapCallParameters` from `universal-router-sdk` which handles this...
      // IF we can construct the `UniswapTrade`.
      // Let's try to construct `UniswapTrade` with a dummy route just to get the class, 
      // then swap the internal trade? No that's hacky.
      
      // Better: Construct the `UniswapTrade` properly.
      // I need to create a `RouterRoute` (v4).
      // This seems hard without the router-sdk source.
      
      // FALBACK: Use `V4Planner` from `universal-router-sdk` if available, or just encode manually.
      // I'll try to use the `SwapRouter`'s static method `swapCallParameters` but I'll pass a custom object if `UniswapTrade` is hard.
      // Actually, looking at `universal-router-sdk` source I read:
      // `UniswapTrade` constructor takes `trade` and `options`.
      // The `trade` can be a V4 trade?
      // The source code had `UniswapTrade` class.
      // It checks `this.trade.swaps[0].route.protocol`.
      // So the trade object must have `swaps` array.
      // The V4 SDK `Trade` object HAS `swaps`.
      // So I can pass the V4 `Trade` directly to `UniswapTrade` constructor!
      // But I need to mock the `protocol` property on the route if it's missing.
      // V4 SDK Route probably doesn't have `protocol` property set to 'V4'.
      
      // Let's patch it.
      trade.swaps.forEach(s => s.route.protocol = 'V4'); 
      
      const uniswapTrade = new UniswapTrade(trade, opts);
      const { calldata, value } = SwapRouter.swapCallParameters(uniswapTrade, opts);
      
      if (dryRun) {
        console.log(`   📝 Dry Run: Simulating...`);
        try {
            await publicClient.simulateContract({
                address: UNIVERSAL_ROUTER,
                abi: [{ name: 'execute', type: 'function', inputs: [{type:'bytes'},{type:'bytes[]'},{type:'uint256'}], outputs: [] }],
                functionName: 'execute',
                args: [
                    '0x' + calldata.slice(2 + 64), // This is hacky. `calldata` is the whole thing.
                    // Wait, `swapCallParameters` returns the whole calldata for the transaction.
                    // It targets the router.
                ],
                // Wait, simulateContract needs the parsed args.
                // We should use `call` or `sendTransaction` with simulation?
                // `viem` `call` with `data` is easier.
                account: account.address,
                to: UNIVERSAL_ROUTER,
                data: calldata,
                value: BigInt(value)
            });
            console.log(`   ✅ Simulation Successful`);
        } catch (e) {
            console.log(`   ⚠️ Simulation Failed (could be expected if balance low): ${e.message.slice(0, 100)}...`);
        }
      } else {
        console.log(`   💸 Sending Transaction...`);
        const hash = await walletClient.sendTransaction({
            account,
            to: UNIVERSAL_ROUTER,
            data: calldata,
            value: BigInt(value)
        });
        console.log(`   ✅ Sent: https://basescan.org/tx/${hash}`);
        await publicClient.waitForTransactionReceipt({ hash });
      }

    } catch (e) {
      console.error(`   ❌ Error in round ${i+1}:`, e);
    }

    if (i < rounds - 1) {
        console.log(`   ⏳ Waiting 3s...`);
        await sleep(3000);
    }
  }
}

main().catch(console.error);
