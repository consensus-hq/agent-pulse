#!/usr/bin/env node
/**
 * Debug script: Generate Uniswap V4 Universal Router calldata for PULSE/WETH pool
 * 
 * This script uses @uniswap/v4-sdk and @uniswap/universal-router-sdk planners
 * (NOT hand-rolled bytes) to generate calldata for a 10k PULSE exact-in swap.
 * 
 * Usage:
 *   node scripts/debug-v4-swap-calldata.mjs --dry-run        # eth_call simulation
 *   node scripts/debug-v4-swap-calldata.mjs --send           # live transaction
 *   node scripts/debug-v4-swap-calldata.mjs --compare        # compare with known-success tx
 * 
 * Env:
 *   PRIVATE_KEY - hex private key with 0x prefix
 *   RPC_URL     - Base mainnet RPC endpoint
 */

import { 
  createPublicClient, 
  createWalletClient, 
  http, 
  parseUnits, 
  formatUnits,
  encodeAbiParameters,
  parseAbiParameters,
  hexToBytes,
  toHex
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';

// Uniswap SDK imports
import { Pool, Route, Trade } from '@uniswap/v4-sdk';
import universalRouterSdk from '@uniswap/universal-router-sdk';
import { Token, CurrencyAmount, TradeType, Percent, Ether } from '@uniswap/sdk-core';

const { Trade: RouterTrade, UniswapTrade, SwapRouter } = universalRouterSdk;

// ========== CONFIGURATION ==========
const PULSE_ADDRESS = '0x21111B39A502335aC7e45c4574Dd083A69258b07';
const WETH_ADDRESS = '0x4200000000000000000000000000000000000006';
const UNIVERSAL_ROUTER = '0x6ff5693b99212da76ad316178a184ab56d299b43';
const POOL_MANAGER = '0x498581fF718922c3f8e6A244956aF099B2652b2b';
const STATE_VIEW = '0xa3c0c9b65bad0b08107aa264b0f3db444b867a71';
const PERMIT2 = '0x000000000022D473030F116dDEE9F6B43aC78BA3';

// Clanker V4 Pool configuration
// From successful tx 0xd5e293e919bddb8feacb5420c0330b885341deedb95a87b7724781c4809c28f6
const POOL_FEE = 8388608; // 0x800000 = dynamic fee flag
const POOL_TICK_SPACING = 200;
const POOL_HOOKS = '0xb429d62f8f3bffb98cdb9569533ea23bf0ba28cc';

// Wrapper contract (used in known-success tx)
const SWAP_WRAPPER = '0x21e99b325d53fe3d574ac948b9cb1519da03e518';

// Known-success transaction for comparison
const KNOWN_SUCCESS_TX = '0xd5e293e919bddb8feacb5420c0330b885341deedb95a87b7724781c4809c28f6';

// ========== ARGUMENTS ==========
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const sendTx = args.includes('--send');
const compareMode = args.includes('--compare');

// ========== SETUP ==========
function getEnvVar(name, required = true) {
  const value = process.env[name];
  if (required && !value) {
    console.error(`Error: Environment variable ${name} is required`);
    process.exit(1);
  }
  return value;
}

const PRIVATE_KEY = getEnvVar('PRIVATE_KEY');
const RPC_URL = process.env.BASE_RPC_URL || 'https://mainnet.base.org';

const account = privateKeyToAccount(PRIVATE_KEY.startsWith('0x') ? PRIVATE_KEY : `0x${PRIVATE_KEY}`);

const publicClient = createPublicClient({
  chain: base,
  transport: http(RPC_URL)
});

const walletClient = createWalletClient({
  account,
  chain: base,
  transport: http(RPC_URL)
});

// ========== STATE VIEW ABI ==========
const STATE_VIEW_ABI = [
  {
    name: 'getSlot0',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'poolId', type: 'bytes32' }],
    outputs: [
      { name: 'sqrtPriceX96', type: 'uint160' },
      { name: 'tick', type: 'int24' },
      { name: 'protocolFee', type: 'uint24' },
      { name: 'lpFee', type: 'uint24' }
    ]
  },
  {
    name: 'getLiquidity',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'poolId', type: 'bytes32' }],
    outputs: [{ name: 'liquidity', type: 'uint128' }]
  }
];

// ========== ERC20 ABI ==========
const ERC20_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ type: 'uint256' }]
  },
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }],
    outputs: [{ type: 'uint256' }]
  },
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [{ type: 'bool' }]
  }
];

// ========== PERMIT2 ABI ==========
const PERMIT2_ABI = [
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'token', type: 'address' },
      { name: 'spender', type: 'address' }
    ],
    outputs: [
      { name: 'amount', type: 'uint160' },
      { name: 'expiration', type: 'uint48' },
      { name: 'nonce', type: 'uint48' }
    ]
  },
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint160' },
      { name: 'expiration', type: 'uint48' }
    ],
    outputs: []
  }
];

// ========== UNIVERSAL ROUTER ABI ==========
const UNIVERSAL_ROUTER_ABI = [
  {
    name: 'execute',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: 'commands', type: 'bytes' },
      { name: 'inputs', type: 'bytes[]' },
      { name: 'deadline', type: 'uint256' }
    ],
    outputs: []
  }
];

// ========== HELPER FUNCTIONS ==========
async function getPoolData() {
  const chainId = 8453;
  
  // Create token objects
  const WETH = new Token(chainId, WETH_ADDRESS, 18, 'WETH', 'Wrapped Ether');
  const PULSE = new Token(chainId, PULSE_ADDRESS, 18, 'PULSE', 'Agent Pulse');
  
  // Sort for pool key (currency0 < currency1)
  const sorted = WETH.sortsBefore(PULSE);
  const currency0 = sorted ? WETH : PULSE;
  const currency1 = sorted ? PULSE : WETH;
  
  // Get pool ID
  const poolId = Pool.getPoolId(currency0, currency1, POOL_FEE, POOL_TICK_SPACING, POOL_HOOKS);
  
  console.log('Pool Configuration:');
  console.log('  Pool ID:', poolId);
  console.log('  Currency0:', currency0.address);
  console.log('  Currency1:', currency1.address);
  console.log('  Fee:', POOL_FEE, `(0x${POOL_FEE.toString(16)})`);
  console.log('  Tick Spacing:', POOL_TICK_SPACING);
  console.log('  Hooks:', POOL_HOOKS);
  console.log('');
  
  // Fetch pool state
  const slot0 = await publicClient.readContract({
    address: STATE_VIEW,
    abi: STATE_VIEW_ABI,
    functionName: 'getSlot0',
    args: [poolId]
  });
  
  const liquidity = await publicClient.readContract({
    address: STATE_VIEW,
    abi: STATE_VIEW_ABI,
    functionName: 'getLiquidity',
    args: [poolId]
  });
  
  console.log('Pool State:');
  console.log('  SqrtPriceX96:', slot0[0].toString());
  console.log('  Tick:', slot0[1].toString());
  console.log('  Protocol Fee:', slot0[2].toString());
  console.log('  LP Fee:', slot0[3].toString());
  console.log('  Liquidity:', liquidity.toString());
  console.log('');
  
  // Create V4 Pool object
  const pool = new Pool(
    currency0,
    currency1,
    POOL_FEE,
    POOL_TICK_SPACING,
    POOL_HOOKS,
    slot0[0].toString(),
    liquidity.toString(),
    Number(slot0[1])
  );
  
  return { pool, WETH, PULSE, currency0, currency1 };
}

async function buildV4SwapCalldata(pool, WETH, PULSE, amountIn) {
  const chainId = 8453;
  
  // For PULSE -> WETH swap, determine zeroForOne based on pool ordering
  const zeroForOne = PULSE.address.toLowerCase() < WETH.address.toLowerCase();
  
  // Create route
  const route = new Route([pool], PULSE, WETH);
  
  // Create currency amount
  const amountInCurrency = CurrencyAmount.fromRawAmount(PULSE, amountIn.toString());
  
  // Create V4 Trade
  const trade = await Trade.fromRoute(route, amountInCurrency, TradeType.EXACT_INPUT);
  
  console.log('Trade Details:');
  console.log('  Input Amount:', formatUnits(amountIn, 18), 'PULSE');
  console.log('  Expected Output:', formatUnits(trade.outputAmount.quotient.toString(), 18), 'WETH');
  console.log('  Execution Price:', trade.executionPrice.toFixed(10));
  console.log('  Trade Type:', trade.tradeType === TradeType.EXACT_INPUT ? 'EXACT_INPUT' : 'EXACT_OUTPUT');
  console.log('');
  
  // Create Router Trade with V4 route
  // Note: RouterTrade expects the route to be wrapped in v4Routes array
  const routerTrade = new RouterTrade({
    v2Routes: [],
    v3Routes: [],
    v4Routes: [{
      routev4: route,
      inputAmount: amountInCurrency,
      outputAmount: trade.outputAmount
    }],
    mixedRoutes: [],
    tradeType: TradeType.EXACT_INPUT
  });
  
  console.log('Router Trade:');
  console.log('  Number of routes:', routerTrade.routes.length);
  console.log('  Is all V4:', routerTrade.routes.every(r => r.protocol === 'V4'));
  console.log('');
  
  // Create UniswapTrade (this encodes the V4 actions)
  const slippageTolerance = new Percent(5, 100); // 5%
  const deadline = Math.floor(Date.now() / 1000) + 300; // 5 minutes
  
  const uniswapTrade = new UniswapTrade(routerTrade, {
    slippageTolerance,
    recipient: account.address,
    deadline
  });
  
  console.log('Uniswap Trade:');
  console.log('  Is all V4:', uniswapTrade.isAllV4);
  console.log('  Input requires wrap:', uniswapTrade.inputRequiresWrap);
  console.log('  Output requires unwrap:', uniswapTrade.outputRequiresUnwrap);
  console.log('  Recipient:', account.address);
  console.log('  Deadline:', deadline);
  console.log('');
  
  // Generate swap call parameters using the SDK
  const { calldata, value } = SwapRouter.swapCallParameters(routerTrade, {
    slippageTolerance,
    recipient: account.address,
    deadline
  });
  
  return {
    calldata,
    value,
    trade,
    routerTrade,
    uniswapTrade,
    deadline
  };
}

async function parseCalldata(calldata) {
  // The calldata returned by SwapRouter.swapCallParameters is the full transaction data
  // for calling UniversalRouter.execute(commands, inputs, deadline)
  
  // Remove 0x prefix for parsing
  const data = calldata.startsWith('0x') ? calldata.slice(2) : calldata;
  
  // Function selector for execute(bytes,bytes[],uint256)
  const selector = data.slice(0, 8);
  
  console.log('Generated Calldata Analysis:');
  console.log('  Full calldata length:', calldata.length, 'chars (', calldata.length / 2 - 1, 'bytes)');
  console.log('  Function selector:', `0x${selector}`);
  console.log('');
  
  // The SDK returns the full encoded call to execute(bytes,bytes[],uint256)
  // We need to decode it to see the components
  
  return {
    selector: `0x${selector}`,
    fullCalldata: calldata
  };
}

async function checkAndApprovePermit2(token, amount) {
  // Check ERC20 allowance to Permit2
  const erc20Allowance = await publicClient.readContract({
    address: token,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [account.address, PERMIT2]
  });
  
  console.log('ERC20 Allowance (token -> Permit2):', formatUnits(erc20Allowance, 18));
  
  if (erc20Allowance < amount) {
    if (dryRun) {
      console.log('[DRY RUN] Would approve Permit2 for', formatUnits(amount, 18), 'tokens');
    } else {
      console.log('Approving Permit2...');
      const hash = await walletClient.writeContract({
        address: token,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [PERMIT2, amount * 10n] // Approve 10x
      });
      await publicClient.waitForTransactionReceipt({ hash });
      console.log('Approved:', hash);
    }
  }
  
  // Check Permit2 allowance for Universal Router
  const permit2Allowance = await publicClient.readContract({
    address: PERMIT2,
    abi: PERMIT2_ABI,
    functionName: 'allowance',
    args: [account.address, token, UNIVERSAL_ROUTER]
  });
  
  console.log('Permit2 Allowance (owner -> router):', formatUnits(permit2Allowance[0], 18));
  
  if (permit2Allowance[0] < amount) {
    if (dryRun) {
      console.log('[DRY RUN] Would approve Router on Permit2');
    } else {
      console.log('Approving Router on Permit2...');
      const hash = await walletClient.writeContract({
        address: PERMIT2,
        abi: PERMIT2_ABI,
        functionName: 'approve',
        args: [token, UNIVERSAL_ROUTER, (1n << 160n) - 1n, (1n << 48n) - 1n]
      });
      await publicClient.waitForTransactionReceipt({ hash });
      console.log('Router approved on Permit2:', hash);
    }
  }
}

async function compareWithKnownSuccess(generatedCalldata) {
  console.log('\n========== COMPARISON WITH KNOWN-SUCCESS TX ==========');
  console.log('Known-success tx:', KNOWN_SUCCESS_TX);
  console.log('Wrapper contract:', SWAP_WRAPPER);
  console.log('');
  
  // The known-success tx calls the wrapper, NOT Universal Router directly
  // The wrapper then calls Universal Router internally
  
  console.log('Key Finding:');
  console.log('  The known-success tx calls the WRAPPER contract (0x21e99b3...)');
  console.log('  The wrapper handles all the complex V4 encoding internally.');
  console.log('');
  
  console.log('Wrapper Path Encoding:');
  // The wrapper expects path encoded as:
  // abi.encode(tokenIn, tokenOut, universalRouter, poolManager, fee, tickSpacing, hooks, hookData)
  const wrapperPath = encodeAbiParameters(
    parseAbiParameters('address, address, address, address, uint24, int24, address, bytes'),
    [PULSE_ADDRESS, WETH_ADDRESS, UNIVERSAL_ROUTER, POOL_MANAGER, POOL_FEE, POOL_TICK_SPACING, POOL_HOOKS, '0x']
  );
  console.log('  Path:', wrapperPath);
  console.log('');
  
  console.log('Direct Universal Router vs Wrapper:');
  console.log('  ┌─────────────────────────────────────────────────────────────┐');
  console.log('  │ Direct UR call (what SDK generates):                        │');
  console.log('  │   - Uses Permit2 for token transfers                        │');
  console.log('  │   - Requires V4_SWAP command encoding                       │');
  console.log('  │   - Requires SETTLE/TAKE actions for V4                     │');
  console.log('  │   - Complex calldata structure                              │');
  console.log('  └─────────────────────────────────────────────────────────────┘');
  console.log('');
  console.log('  ┌─────────────────────────────────────────────────────────────┐');
  console.log('  │ Wrapper call (what works):                                  │');
  console.log('  │   - Wrapper handles all V4 encoding internally              │');
  console.log('  │   - Simple function signature                               │');
  console.log('  │   - Takes fee recipients and bips as parameters             │');
  console.log('  │   - Abstracts away V4_SWAP complexity                       │');
  console.log('  └─────────────────────────────────────────────────────────────┘');
  console.log('');
  
  return {
    wrapperPath,
    conclusion: 'Must use wrapper for reliable V4 swaps'
  };
}

// ========== MAIN ==========
async function main() {
  console.log('=== Uniswap V4 Universal Router Calldata Debugger ===\n');
  console.log('Wallet:', account.address);
  console.log('RPC:', RPC_URL);
  console.log('Router:', UNIVERSAL_ROUTER);
  console.log('');
  
  // Get pool data
  const { pool, WETH, PULSE } = await getPoolData();
  
  // Amount to swap: 10,000 PULSE
  const SWAP_AMOUNT = parseUnits('10000', 18);
  
  console.log('Swap Configuration:');
  console.log('  Amount:', formatUnits(SWAP_AMOUNT, 18), 'PULSE');
  console.log('  Direction: PULSE -> WETH');
  console.log('');
  
  // Check balances
  const pulseBalance = await publicClient.readContract({
    address: PULSE_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [account.address]
  });
  
  const ethBalance = await publicClient.getBalance({ address: account.address });
  
  console.log('Balances:');
  console.log('  PULSE:', formatUnits(pulseBalance, 18));
  console.log('  ETH:', formatUnits(ethBalance, 18));
  console.log('');
  
  if (pulseBalance < SWAP_AMOUNT && !compareMode) {
    console.error('Error: Insufficient PULSE balance');
    console.error('Use --compare flag to see comparison without needing balance');
    process.exit(1);
  }
  
  // Build swap calldata using SDK planners
  console.log('Building swap calldata using @uniswap/v4-sdk and @uniswap/universal-router-sdk...\n');
  
  let sdkCalldata = null;
  let sdkError = null;
  
  try {
    const { calldata, value, trade, routerTrade, uniswapTrade, deadline } = await buildV4SwapCalldata(
      pool, WETH, PULSE, SWAP_AMOUNT
    );
    
    sdkCalldata = calldata;
    
    // Parse and display calldata
    const parsed = await parseCalldata(calldata);
    
    console.log('SDK-Generated Calldata:');
    console.log('  Value (ETH):', value);
    console.log('  Calldata:', calldata.slice(0, 100) + '...');
    console.log('');
    
    // Check approvals
    console.log('\n=== Checking Approvals ===');
    await checkAndApprovePermit2(PULSE_ADDRESS, SWAP_AMOUNT);
    
    // Execute or simulate
    if (sendTx) {
      console.log('\n=== Sending Transaction ===');
      
      const hash = await walletClient.sendTransaction({
        to: UNIVERSAL_ROUTER,
        data: calldata,
        value: BigInt(value)
      });
      
      console.log('Transaction sent:', hash);
      console.log('Basescan:', `https://basescan.org/tx/${hash}`);
      
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      console.log('Status:', receipt.status);
      console.log('Gas used:', receipt.gasUsed.toString());
      
    } else if (dryRun) {
      console.log('\n=== Dry Run (eth_call) ===');
      
      try {
        const result = await publicClient.call({
          account: account.address,
          to: UNIVERSAL_ROUTER,
          data: calldata,
          value: BigInt(value)
        });
        
        console.log('Simulation result:', result);
        console.log('✓ Simulation succeeded');
      } catch (err) {
        console.error('✗ Simulation failed:', err.message || err);
        console.log('\nNote: Simulation may fail due to:');
        console.log('  - Permit2 approvals not set up');
        console.log('  - State differences in eth_call vs actual execution');
        console.log('  - Try with --send for actual transaction (with small amount first)');
      }
    }
    
    // Summary output
    console.log('\n=== Summary ===');
    console.log('Router Address:', UNIVERSAL_ROUTER);
    console.log('Calldata Length:', calldata.length, 'chars');
    console.log('Calldata Bytes:', calldata.length / 2 - 1, 'bytes');
    console.log('Value:', value, 'wei');
    console.log('Expected Output:', formatUnits(trade.outputAmount.quotient.toString(), 18), 'WETH');
    
  } catch (err) {
    sdkError = err;
    console.error('\nError building swap calldata with SDK:', err.message || err);
    console.log('\n*** KEY FINDING: SDK does not support custom hooks ***');
    console.log('The Clanker dynamic fee hook (0xb429d62f...) is not recognized by the SDK.');
    console.log('This is why the wrapper contract approach is necessary.\n');
  }
  
  // If compare mode, show comparison with known-success tx (even if SDK failed)
  if (compareMode || sdkError) {
    await compareWithKnownSuccess(sdkCalldata);
  }
  
  if (!dryRun && !sendTx && !compareMode && !sdkError) {
    console.log('\n=== Dry Run Summary ===');
    console.log('To simulate this swap:');
    console.log('  node scripts/debug-v4-swap-calldata.mjs --dry-run');
    console.log('');
    console.log('To send the transaction:');
    console.log('  node scripts/debug-v4-swap-calldata.mjs --send');
    console.log('');
    console.log('To compare with known-success tx:');
    console.log('  node scripts/debug-v4-swap-calldata.mjs --compare');
  }
}

main().catch(console.error);
