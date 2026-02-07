#!/usr/bin/env node
/**
 * Market maker / volume generator for the PULSE/WETH Uniswap v4 pool on Base.
 *
 * Strategy (per round):
 *   1) Sell a small random amount of PULSE -> WETH (cheap: ERC20 input, no wrapping)
 *   2) Optionally buy PULSE back with the received WETH
 *
 * NOTE:
 * - This uses Uniswap Universal Router (v2) + Permit2.
 * - One-time approvals are required:
 *     (a) ERC20 approve(token -> Permit2)
 *     (b) Permit2 approve(token, spender=UniversalRouter)
 * - Use --dry-run first.
 *
 * Usage:
 *   node scripts/market-maker.mjs
 *   node scripts/market-maker.mjs --rounds 5 --interval-ms 600000
 *   node scripts/market-maker.mjs --sell-only
 *   node scripts/market-maker.mjs --dry-run --rounds 1
 *
 * Optional flags:
 *   --gas-budget-eth 0.0005
 *   --min-sell-pulse 50000
 *   --max-sell-pulse 200000
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  formatEther,
  parseUnits,
  formatUnits,
  encodeAbiParameters,
  parseAbiParameters,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';
import * as fs from 'node:fs';

// ============ CONFIG (Base mainnet) ============
const RPC = 'https://base-mainnet.g.alchemy.com/v2/3WU_yDRSxtj3kGD_YydFu';

const PULSE = '0x21111B39A502335aC7e45c4574Dd083A69258b07';
const WETH = '0x4200000000000000000000000000000000000006';

// IMPORTANT: Use the wrapper contract for V4 swaps, NOT Universal Router directly
const SWAP_WRAPPER = '0x21e99b325d53fe3d574ac948b9cb1519da03e518';
const UNIVERSAL_ROUTER = '0x6ff5693b99212da76ad316178a184ab56d299b43';
const POOL_MANAGER = '0x498581fF718922c3f8e6A244956aF099B2652b2b'; // informational / sanity
const PERMIT2 = '0x000000000022D473030F116dDEE9F6B43aC78BA3';

// Pool key components
const currency0 = PULSE; // lower address
const currency1 = WETH;
const fee = 8388608; // 0x800000 = dynamic fee flag (Clanker V4)
const tickSpacing = 200;
const hooks = '0xb429d62f8f3bffb98cdb9569533ea23bf0ba28cc'; // Clanker dynamic fee hook

// Universal Router command ID for V4_SWAP.
// IMPORTANT: On Universal Router v2, V4_SWAP is 0x10 (see Uniswap universal-router Commands.sol)
const COMMAND_V4_SWAP = '0x10';

// V4 Actions — matches working swap trace tx 0xd5e293e9...
const V4_ACTIONS = '0x060b0f0f';
//   0x06 = SWAP_EXACT_IN_SINGLE
//   0x0b = SETTLE (currency, maxAmount, payerIsUser)
//   0x0f = TAKE_ALL — take output currency
//   0x0f = TAKE_ALL — sweep remaining input currency (refund)

// Token decimals (known)
const PULSE_DECIMALS = 18;
const WETH_DECIMALS = 18;

const DEFAULT_KEY_PATH = '/opt/fundbot/secrets/hotwallet/connie.core-mainnet.key.json';

// ============ ABIs (minimal) ============
const ERC20_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
];

const PERMIT2_ABI = [
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'token', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [
      { name: 'amount', type: 'uint160' },
      { name: 'expiration', type: 'uint48' },
      { name: 'nonce', type: 'uint48' },
    ],
  },
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint160' },
      { name: 'expiration', type: 'uint48' },
    ],
    outputs: [],
  },
];

const UNIVERSAL_ROUTER_ABI = [
  {
    name: 'execute',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: 'commands', type: 'bytes' },
      { name: 'inputs', type: 'bytes[]' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [],
  },
];

// Wrapper contract ABI for V4 swaps (based on successful tx 0xd5e293e919...)
const SWAP_WRAPPER_ABI = [
  {
    name: 'swapExactTokensForETH',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'amountOutMin', type: 'uint256' },
      { name: 'path', type: 'bytes' },
      { name: 'feeRecipient1', type: 'address' },
      { name: 'feeRecipient2', type: 'address' },
      { name: 'feeRecipient3', type: 'address' },
      { name: 'feeBips1', type: 'uint24' },
      { name: 'feeBips2', type: 'uint24' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    name: 'swapExactETHForTokens',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: 'amountOutMin', type: 'uint256' },
      { name: 'path', type: 'bytes' },
      { name: 'feeRecipient1', type: 'address' },
      { name: 'feeRecipient2', type: 'address' },
      { name: 'feeRecipient3', type: 'address' },
      { name: 'feeBips1', type: 'uint24' },
      { name: 'feeBips2', type: 'uint24' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [],
  },
];

// ============ Small utilities ============
const MAX_UINT256 = (1n << 256n) - 1n;
const MAX_UINT160 = (1n << 160n) - 1n;
const MAX_UINT48 = (1n << 48n) - 1n;

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseCli(argv) {
  /**
   * Simple parser:
   *   --flag            => { flag: true }
   *   --key value       => { key: "value" }
   */
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next != null && !next.startsWith('--')) {
      out[key] = next;
      i++;
    } else {
      out[key] = true;
    }
  }
  return out;
}

function randomIntInclusive(min, max) {
  // min/max are JS numbers (safe here: 50k..200k)
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function formatAmount(amount, decimals) {
  // formatUnits returns string; trim long tails for console readability
  const s = formatUnits(amount, decimals);
  if (!s.includes('.')) return s;
  const [i, f] = s.split('.');
  return `${i}.${f.slice(0, 6)}`;
}

function receiptGasCostWei(receipt) {
  const gasUsed = receipt.gasUsed ?? 0n;
  const price = receipt.effectiveGasPrice ?? receipt.gasPrice ?? 0n;
  return gasUsed * price;
}

function shortError(e) {
  const msg = e?.shortMessage || e?.message || String(e);
  return msg.length > 240 ? `${msg.slice(0, 240)}…` : msg;
}

function encodeV4ExactInSingle({
  zeroForOne,
  amountIn,
  currencyIn,
  currencyOut,
  amountOutMinimum = 0n,
}) {
  // ExactInputSingleParams — tuple-wrapped (UR decoder follows leading offset)
  // Verified: working swap trace has 0x20 offset at start of swap params
  const swapParams = encodeAbiParameters(
    parseAbiParameters(
      '((address,address,uint24,int24,address),bool,uint128,uint128,bytes)'
    ),
    [[[currency0, currency1, fee, tickSpacing, hooks], zeroForOne, amountIn, amountOutMinimum, '0x']]
  );

  // SETTLE(currency, maxAmount, payerIsUser) — flat encoding (no tuple wrapper)
  // payerIsUser=true → UR pulls tokens from caller via Permit2
  const settleParams = encodeAbiParameters(
    parseAbiParameters('address, uint256, bool'),
    [currencyIn, amountIn, true]
  );

  // TAKE_ALL(outputCurrency, minAmount=0) — flat encoding
  const takeOutputParams = encodeAbiParameters(
    parseAbiParameters('address, uint256'),
    [currencyOut, 0n]
  );

  // TAKE_ALL(inputCurrency, minAmount=0) — sweep any unused input tokens
  const takeSweepParams = encodeAbiParameters(
    parseAbiParameters('address, uint256'),
    [currencyIn, 0n]
  );

  // V4_SWAP input: abi.encode(bytes actions, bytes[] params)
  return encodeAbiParameters(
    parseAbiParameters('bytes actions, bytes[] params'),
    [V4_ACTIONS, [swapParams, settleParams, takeOutputParams, takeSweepParams]]
  );
}

// Encode path for wrapper contract (based on successful tx 0xd5e293e919... analysis)
// Path format: abi.encode(tokenIn, tokenOut, universalRouter, poolManager, fee, tickSpacing, hooks, hookData)
function encodeWrapperPath({ tokenIn, tokenOut, hookData = '0x' }) {
  return encodeAbiParameters(
    parseAbiParameters('address, address, address, address, uint24, int24, address, bytes'),
    [tokenIn, tokenOut, UNIVERSAL_ROUTER, POOL_MANAGER, fee, tickSpacing, hooks, hookData]
  );
}

async function readBalance(publicClient, token, owner) {
  return publicClient.readContract({
    address: token,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [owner],
  });
}

async function ensurePermit2Approvals({
  label,
  token,
  publicClient,
  walletClient,
  owner,
  spender,
  dryRun,
  gasBudgetState,
  minPermit2Amount,
}) {
  // 1) ERC20 approve(token -> Permit2)
  const erc20Allowance = await publicClient.readContract({
    address: token,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [owner, PERMIT2],
  });

  if (erc20Allowance < minPermit2Amount) {
    await submitTx({
      publicClient,
      walletClient,
      owner,
      dryRun,
      gasBudgetState,
      label: `${label}: ERC20 approve -> Permit2`,
      address: token,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [PERMIT2, MAX_UINT256],
    });
  } else {
    console.log(`✓ ${label}: ERC20 allowance(token->Permit2) OK`);
  }

  // 2) Permit2 approve(token, spender=UniversalRouter)
  const permit2Allowance = await publicClient.readContract({
    address: PERMIT2,
    abi: PERMIT2_ABI,
    functionName: 'allowance',
    args: [owner, token, spender],
  });

  // permit2Allowance = [amount, expiration, nonce]
  const amount = permit2Allowance[0];
  const expiration = permit2Allowance[1];

  const minExpiration = BigInt(nowSec() + 60 * 60 * 24 * 30); // 30 days
  const needsPermit2 = amount < BigInt(minPermit2Amount) || BigInt(expiration) < minExpiration;

  if (needsPermit2) {
    await submitTx({
      publicClient,
      walletClient,
      owner,
      dryRun,
      gasBudgetState,
      label: `${label}: Permit2 approve -> UniversalRouter`,
      address: PERMIT2,
      abi: PERMIT2_ABI,
      functionName: 'approve',
      args: [token, spender, MAX_UINT160, MAX_UINT48],
    });
  } else {
    console.log(`✓ ${label}: Permit2 allowance(owner->router) OK`);
  }
}

async function estimateCostWei(publicClient, { address, abi, functionName, args, owner, value = 0n }) {
  const gas = await publicClient.estimateContractGas({
    address,
    abi,
    functionName,
    args,
    account: owner,
    value,
  });

  // Base is EIP-1559.
  // We'll estimate worst-case cost using maxFeePerGas (upper bound).
  const fees = await publicClient.estimateFeesPerGas();
  const maxFeePerGas = fees.maxFeePerGas ?? fees.gasPrice;
  const estCost = gas * (maxFeePerGas ?? 0n);

  return { gas, maxFeePerGas: maxFeePerGas ?? 0n, estCost };
}

async function submitTx({
  label,
  address,
  abi,
  functionName,
  args,
  value = 0n,
  publicClient,
  walletClient,
  owner,
  dryRun,
  gasBudgetState,
}) {
  const { gas, maxFeePerGas, estCost } = await estimateCostWei(publicClient, {
    address,
    abi,
    functionName,
    args,
    owner,
    value,
  });

  const remainingWei = gasBudgetState.budgetWei - gasBudgetState.spentWei;
  console.log(`\n→ ${label}`);
  console.log(`  estGas: ${gas.toString()}`);
  console.log(`  maxFeePerGas: ${maxFeePerGas.toString()}`);
  console.log(`  estMaxCost: ${formatEther(estCost)} ETH (budget remaining: ${formatEther(remainingWei)} ETH)`);

  if (dryRun) {
    console.log('  [DRY RUN] not sending');
    return { hash: null, receipt: null, costWei: 0n };
  }

  // Conservative pre-flight stop.
  if (estCost > remainingWei) {
    throw new Error(
      `Gas budget would be exceeded by this tx (need up to ${formatEther(estCost)} ETH, remaining ${formatEther(remainingWei)} ETH).`
    );
  }

  const hash = await walletClient.writeContract({
    address,
    abi,
    functionName,
    args,
    value,
  });

  console.log(`  tx: https://basescan.org/tx/${hash}`);

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  const costWei = receiptGasCostWei(receipt);
  gasBudgetState.spentWei += costWei;

  console.log(`  status: ${receipt.status}`);
  console.log(`  gasUsed: ${receipt.gasUsed.toString()}`);
  console.log(`  gasCost: ${formatEther(costWei)} ETH`);
  console.log(`  gasSpentTotal: ${formatEther(gasBudgetState.spentWei)} ETH`);

  return { hash, receipt, costWei };
}

// Fee recipients for wrapper (from successful tx analysis)
const FEE_RECIPIENT_1 = '0x7f77bad9eb06373fe3aee84f85a9d701ff820eeb';
const FEE_RECIPIENT_2 = '0x62011a488c04b52e14fd6b5abc022af3cf514805';
const FEE_RECIPIENT_3 = '0x92d5dd3d1c875fc91bab40713f8b4abe46f56b0b';
const FEE_BIPS_1 = 3000; // 0x0bb8
const FEE_BIPS_2 = 2500; // 0x09c4

async function doV4SwapExactInSingle({
  label,
  publicClient,
  walletClient,
  owner,
  amountIn,
  zeroForOne,
  currencyIn,
  currencyOut,
  dryRun,
  gasBudgetState,
  logCalldata = false,
}) {
  const deadline = BigInt(nowSec() + 300); // 5 minutes

  const v4SwapInput = encodeV4ExactInSingle({
    zeroForOne,
    amountIn,
    currencyIn,
    currencyOut,
    amountOutMinimum: 0n,
  });

  const commands = COMMAND_V4_SWAP;
  const inputs = [v4SwapInput];

  if (logCalldata) {
    console.log(`\n  commands: ${commands}`);
    console.log(`  inputs[0]: ${v4SwapInput}`);
  }

  return submitTx({
    label,
    address: UNIVERSAL_ROUTER,
    abi: UNIVERSAL_ROUTER_ABI,
    functionName: 'execute',
    args: [commands, inputs, deadline],
    value: 0n,
    publicClient,
    walletClient,
    owner,
    dryRun,
    gasBudgetState,
  });
}

// ============ MAIN ============
async function main() {
  const args = parseCli(process.argv.slice(2));
  const help = args.help || args.h;
  const probe = !!args['probe'];
  
  if (help) {
    console.log(`market-maker.mjs\n\nFlags:\n  --rounds N (default 5)\n  --interval-ms MS (default 600000)\n  --dry-run\n  --sell-only\n  --probe (tiny test swap: 10k PULSE)\n  --gas-budget-eth 0.0005\n  --min-sell-pulse 50000\n  --max-sell-pulse 200000\n  --key-path /path/to/key.json (default: ${DEFAULT_KEY_PATH})\n`);
    process.exit(0);
  }

  const rounds = args.rounds != null ? Number(args.rounds) : 5;
  const intervalMs = args['interval-ms'] != null ? Number(args['interval-ms']) : 600_000;
  const dryRun = !!args['dry-run'];
  const sellOnly = !!args['sell-only'];

  const gasBudgetEth = args['gas-budget-eth'] != null ? String(args['gas-budget-eth']) : '0.0005';
  const gasBudgetWei = parseEther(gasBudgetEth);

  const minSellPulseTokens = args['min-sell-pulse'] != null ? Number(args['min-sell-pulse']) : 50_000;
  const maxSellPulseTokens = args['max-sell-pulse'] != null ? Number(args['max-sell-pulse']) : 200_000;

  if (!Number.isFinite(rounds) || rounds <= 0) throw new Error('--rounds must be a positive number');
  if (!Number.isFinite(intervalMs) || intervalMs < 0) throw new Error('--interval-ms must be >= 0');
  if (!Number.isFinite(minSellPulseTokens) || !Number.isFinite(maxSellPulseTokens) || minSellPulseTokens <= 0)
    throw new Error('--min-sell-pulse/--max-sell-pulse must be positive numbers');
  if (maxSellPulseTokens < minSellPulseTokens) throw new Error('--max-sell-pulse must be >= --min-sell-pulse');

  const keyPath = args['key-path'] || process.env.MM_KEY_PATH || DEFAULT_KEY_PATH;
  const keyData = JSON.parse(fs.readFileSync(keyPath, 'utf-8'));
  const rawPk = keyData.privateKey;
  const PRIVATE_KEY = rawPk.startsWith('0x') ? rawPk : `0x${rawPk}`;

  const account = privateKeyToAccount(PRIVATE_KEY);

  const publicClient = createPublicClient({ chain: base, transport: http(RPC) });
  const walletClient = createWalletClient({ account, chain: base, transport: http(RPC) });

  console.log('=== PULSE/WETH V4 Market Maker (Base) ===');
  console.log(`Wallet: ${account.address}`);
  console.log(`Universal Router: ${UNIVERSAL_ROUTER}`);
  console.log(`Permit2: ${PERMIT2}`);
  console.log(`PoolManager (expected): ${POOL_MANAGER}`);
  console.log(`PoolKey: currency0=${currency0}, currency1=${currency1}, fee=${fee}, tickSpacing=${tickSpacing}, hooks=${hooks}`);
  console.log(`Rounds: ${rounds}`);
  console.log(`Interval (ms): ${intervalMs}`);
  console.log(`Sell-only: ${sellOnly}`);
  console.log(`Dry-run: ${dryRun}`);
  console.log(`Gas budget: ${gasBudgetEth} ETH`);
  console.log(`Sell size range: ${minSellPulseTokens}..${maxSellPulseTokens} PULSE`);

  const gasBudgetState = { budgetWei: gasBudgetWei, spentWei: 0n };

  const ethBal0 = await publicClient.getBalance({ address: account.address });
  const pulseBal0 = await readBalance(publicClient, PULSE, account.address);
  const wethBal0 = await readBalance(publicClient, WETH, account.address);

  console.log('\n--- Starting balances ---');
  console.log(`ETH:   ${formatEther(ethBal0)}`);
  console.log(`PULSE: ${formatAmount(pulseBal0, PULSE_DECIMALS)}`);
  console.log(`WETH:  ${formatAmount(wethBal0, WETH_DECIMALS)}`);

  // One-time approvals (only if needed)
  console.log('\n--- Checking approvals (Permit2 flow) ---');
  const minPulseAllowance = parseUnits(String(maxSellPulseTokens), PULSE_DECIMALS);
  const minWethAllowance = parseEther('1'); // plenty; this is just a threshold for deciding to top-up approvals

  await ensurePermit2Approvals({
    label: 'PULSE',
    token: PULSE,
    publicClient,
    walletClient,
    owner: account.address,
    spender: UNIVERSAL_ROUTER,
    dryRun,
    gasBudgetState,
    minPermit2Amount: minPulseAllowance,
  });

  if (!sellOnly) {
    await ensurePermit2Approvals({
      label: 'WETH',
      token: WETH,
      publicClient,
      walletClient,
      owner: account.address,
      spender: UNIVERSAL_ROUTER,
      dryRun,
      gasBudgetState,
      minPermit2Amount: minWethAllowance,
    });
  }

  // Volume tracking
  let totalPulseSold = 0n;
  let totalWethBought = 0n;
  let totalWethSold = 0n;
  let totalPulseBought = 0n;

  // PROBE MODE: Do a tiny swap to test connectivity
  if (probe) {
    const PROBE_AMOUNT = parseUnits('10000', PULSE_DECIMALS); // 10k PULSE
    console.log(`\n================ PROBE MODE ================`);
    console.log(`Doing tiny test swap: 10,000 PULSE -> WETH`);
    
    try {
      const beforePulse = await readBalance(publicClient, PULSE, account.address);
      const beforeWeth = await readBalance(publicClient, WETH, account.address);
      
      console.log(`Balance before: PULSE=${formatAmount(beforePulse, PULSE_DECIMALS)}, WETH=${formatAmount(beforeWeth, WETH_DECIMALS)}`);
      
      const probeTx = await doV4SwapExactInSingle({
        label: `[PROBE] V4_SWAP PULSE->WETH (10k)`,
        publicClient,
        walletClient,
        owner: account.address,
        amountIn: PROBE_AMOUNT,
        zeroForOne: true,
        currencyIn: PULSE,
        currencyOut: WETH,
        dryRun,
        gasBudgetState,
        logCalldata: true,
        probe: true,
      });
      
      if (!dryRun && probeTx.hash) {
        const receipt = probeTx.receipt;
        console.log(`\n=== PROBE RESULT ===`);
        console.log(`Tx Hash: ${probeTx.hash}`);
        console.log(`Status: ${receipt.status}`);
        console.log(`Gas Used: ${receipt.gasUsed.toString()}`);
        
        const afterPulse = await readBalance(publicClient, PULSE, account.address);
        const afterWeth = await readBalance(publicClient, WETH, account.address);
        console.log(`Balance after: PULSE=${formatAmount(afterPulse, PULSE_DECIMALS)}, WETH=${formatAmount(afterWeth, WETH_DECIMALS)}`);
        console.log(`ΔPULSE: ${formatAmount(afterPulse - beforePulse, PULSE_DECIMALS)}`);
        console.log(`ΔWETH: ${formatAmount(afterWeth - beforeWeth, WETH_DECIMALS)}`);
        console.log(`\nProbe swap successful!`);
      } else if (dryRun) {
        console.log(`\n[DRY RUN] Probe would execute: swap 10k PULSE -> WETH via wrapper ${SWAP_WRAPPER}`);
      }
    } catch (err) {
      console.error(`\n=== PROBE FAILED ===`);
      console.error(`Error: ${shortError(err)}`);
      process.exit(1);
    }
    
    // Exit after probe
    console.log(`\nProbe complete. Exiting.`);
    process.exit(0);
  }

  for (let i = 0; i < rounds; i++) {
    console.log(`\n================ ROUND ${i + 1}/${rounds} ================`);

    // Stop if budget already exceeded
    if (gasBudgetState.spentWei >= gasBudgetState.budgetWei) {
      console.log(`Gas budget exceeded (${formatEther(gasBudgetState.spentWei)} ETH >= ${formatEther(gasBudgetState.budgetWei)} ETH). Stopping.`);
      break;
    }

    const sellPulseTokens = randomIntInclusive(minSellPulseTokens, maxSellPulseTokens);
    const sellAmountPulse = parseUnits(String(sellPulseTokens), PULSE_DECIMALS);

    try {
      const beforePulse = await readBalance(publicClient, PULSE, account.address);
      const beforeWeth = await readBalance(publicClient, WETH, account.address);

      console.log(`\n[SELL] PULSE -> WETH  amountIn=${sellPulseTokens} PULSE (${sellAmountPulse.toString()} wei)`);

      const sellTx = await doV4SwapExactInSingle({
        label: `[SELL] V4_SWAP PULSE->WETH`,
        publicClient,
        walletClient,
        owner: account.address,
        amountIn: sellAmountPulse,
        zeroForOne: true,
        currencyIn: PULSE,
        currencyOut: WETH,
        dryRun,
        gasBudgetState,
        logCalldata: dryRun,
      });

      const afterPulse = await readBalance(publicClient, PULSE, account.address);
      const afterWeth = await readBalance(publicClient, WETH, account.address);

      const pulseDelta = afterPulse - beforePulse;
      const wethDelta = afterWeth - beforeWeth;

      if (!dryRun) {
        totalPulseSold += -pulseDelta; // sold
        totalWethBought += wethDelta; // received
      }

      console.log(`  ΔPULSE: ${formatAmount(pulseDelta, PULSE_DECIMALS)} (negative means sold)`);
      console.log(`  ΔWETH:  ${formatAmount(wethDelta, WETH_DECIMALS)} (positive means received)`);

      if (sellOnly) {
        console.log('[SELL-ONLY] skipping buy-back');
      } else {
        // In live mode, buy with the WETH received from THIS sell.
        // In dry-run mode, wethDelta will be ~0 because state doesn't change; use current wallet WETH balance.
        let buyWethAmount = wethDelta;
        if (dryRun) {
          const curWeth = await readBalance(publicClient, WETH, account.address);
          buyWethAmount = curWeth;
        }

        if (buyWethAmount <= 0n) {
          console.log('[BUY] No WETH available to buy back; skipping.');
        } else {
          const beforePulse2 = afterPulse;
          const beforeWeth2 = afterWeth;

          console.log(`\n[BUY] WETH -> PULSE  amountIn=${formatAmount(buyWethAmount, WETH_DECIMALS)} WETH (${buyWethAmount.toString()} wei)`);

          const buyTx = await doV4SwapExactInSingle({
            label: `[BUY] V4_SWAP WETH->PULSE`,
            publicClient,
            walletClient,
            owner: account.address,
            amountIn: buyWethAmount,
            zeroForOne: false,
            currencyIn: WETH,
            currencyOut: PULSE,
            dryRun,
            gasBudgetState,
            logCalldata: dryRun,
          });

          const afterPulse2 = await readBalance(publicClient, PULSE, account.address);
          const afterWeth2 = await readBalance(publicClient, WETH, account.address);

          const pulseDelta2 = afterPulse2 - beforePulse2;
          const wethDelta2 = afterWeth2 - beforeWeth2;

          if (!dryRun) {
            totalWethSold += -wethDelta2; // spent
            totalPulseBought += pulseDelta2; // received
          }

          console.log(`  ΔPULSE: ${formatAmount(pulseDelta2, PULSE_DECIMALS)} (positive means received)`);
          console.log(`  ΔWETH:  ${formatAmount(wethDelta2, WETH_DECIMALS)} (negative means spent)`);
        }
      }
    } catch (e) {
      console.error(`Round ${i + 1} error: ${shortError(e)}`);
      console.error('Continuing to next round...');
    }

    if (i < rounds - 1) {
      if (dryRun) {
        console.log(`\n[DRY RUN] skipping sleep (${intervalMs}ms)`);
      } else if (intervalMs > 0) {
        console.log(`\nSleeping ${intervalMs}ms...`);
        await sleep(intervalMs);
      }
    }
  }

  const ethBal1 = await publicClient.getBalance({ address: account.address });
  const pulseBal1 = await readBalance(publicClient, PULSE, account.address);
  const wethBal1 = await readBalance(publicClient, WETH, account.address);

  console.log('\n=== SUMMARY ===');
  console.log(`Gas spent (tracked): ${formatEther(gasBudgetState.spentWei)} ETH / budget ${formatEther(gasBudgetState.budgetWei)} ETH`);

  console.log('\nTotal volume (live mode only):');
  console.log(`  PULSE sold:   ${formatAmount(totalPulseSold, PULSE_DECIMALS)}`);
  console.log(`  WETH received:${formatAmount(totalWethBought, WETH_DECIMALS)}`);
  console.log(`  WETH sold:    ${formatAmount(totalWethSold, WETH_DECIMALS)}`);
  console.log(`  PULSE bought: ${formatAmount(totalPulseBought, PULSE_DECIMALS)}`);

  console.log('\nBalances:');
  console.log(`  ETH:   ${formatEther(ethBal0)} -> ${formatEther(ethBal1)}   (Δ ${formatEther(ethBal1 - ethBal0)})`);
  console.log(`  PULSE: ${formatAmount(pulseBal0, PULSE_DECIMALS)} -> ${formatAmount(pulseBal1, PULSE_DECIMALS)}   (Δ ${formatAmount(pulseBal1 - pulseBal0, PULSE_DECIMALS)})`);
  console.log(`  WETH:  ${formatAmount(wethBal0, WETH_DECIMALS)} -> ${formatAmount(wethBal1, WETH_DECIMALS)}   (Δ ${formatAmount(wethBal1 - wethBal0, WETH_DECIMALS)})`);
}

main().catch((e) => {
  console.error('Fatal:', shortError(e));
  process.exit(1);
});
