#!/usr/bin/env node
/**
 * Swap ETH ↔ PULSE via Uniswap V4 Wrapper on Base
 * 
 * This uses the wrapper contract at 0x21e99b325d53fe3d574ac948b9cb1519da03e518
 * which handles the complex V4 swap encoding internally.
 * 
 * Usage:
 *   node scripts/swap-via-router.mjs --amount 0.0001 --direction buy
 *   node scripts/swap-via-router.mjs --amount 1000 --direction sell   (sells 1000 PULSE)
 *   node scripts/swap-via-router.mjs --amount 0.0001 --direction buy --dry-run
 *   node scripts/swap-via-router.mjs --probe  (tiny test swap of 10k PULSE)
 */
import { createPublicClient, createWalletClient, http, parseEther, formatEther, encodeAbiParameters, parseAbiParameters, formatUnits, parseUnits } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';
import * as fs from 'fs';

// ========== CONFIG ==========
const PULSE = '0x21111B39A502335aC7e45c4574Dd083A69258b07';
const WETH  = '0x4200000000000000000000000000000000000006';
const SWAP_WRAPPER = '0x21e99b325d53fe3d574ac948b9cb1519da03e518';
const UNIVERSAL_ROUTER = '0x6ff5693b99212da76ad316178a184ab56d299b43';
const POOL_MANAGER = '0x498581fF718922c3f8e6A244956aF099B2652b2b';
const RPC = 'https://base-mainnet.g.alchemy.com/v2/3WU_yDRSxtj3kGD_YydFu';

// Pool key components (from Clanker V4 deployment)
const fee = 8388608; // 0x800000 = dynamic fee flag (Clanker V4)
const tickSpacing = 200; // Clanker V4 default
const hooks = '0xb429d62f8f3bffb98cdb9569533ea23bf0ba28cc'; // Clanker dynamic fee hook

// Fee recipients for wrapper (from successful tx analysis)
const FEE_RECIPIENT_1 = '0x7f77bad9eb06373fe3aee84f85a9d701ff820eeb';
const FEE_RECIPIENT_2 = '0x62011a488c04b52e14fd6b5abc022af3cf514805';
const FEE_RECIPIENT_3 = '0x92d5dd3d1c875fc91bab40713f8b4abe46f56b0b';
const FEE_BIPS_1 = 3000; // 0x0bb8
const FEE_BIPS_2 = 2500; // 0x09c4

// ========== ARGS ==========
const args = process.argv.slice(2);
const getArg = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i+1] : null; };
const dryRun = args.includes('--dry-run');
const probe = args.includes('--probe');
const direction = getArg('direction') || 'buy'; // buy = ETH→PULSE, sell = PULSE→ETH
const amount = getArg('amount') || '0.0001';

// ========== WALLET ==========
const keyPath = '/opt/fundbot/secrets/hotwallet/connie.core-mainnet.key.json';
const keyData = JSON.parse(fs.readFileSync(keyPath, 'utf-8'));
const raw = keyData.privateKey;
const PRIVATE_KEY = (raw.startsWith('0x') ? raw : `0x${raw}`);
const account = privateKeyToAccount(PRIVATE_KEY);
const publicClient = createPublicClient({ chain: base, transport: http(RPC) });
const walletClient = createWalletClient({ account, chain: base, transport: http(RPC) });

// Wrapper contract ABI
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

// Encode path for wrapper contract
function encodeWrapperPath(tokenIn, tokenOut) {
  return encodeAbiParameters(
    parseAbiParameters('address, address, address, address, uint24, int24, address, bytes'),
    [tokenIn, tokenOut, UNIVERSAL_ROUTER, POOL_MANAGER, fee, tickSpacing, hooks, '0x']
  );
}

console.log(`=== Uniswap V4 Swap (via Wrapper) ===`);
console.log(`Wrapper: ${SWAP_WRAPPER}`);
console.log(`Direction: ${probe ? 'PROBE (10k PULSE→ETH)' : direction}`);
console.log(`Amount: ${probe ? '10000' : amount} ${probe ? 'PULSE' : (direction === 'buy' ? 'ETH' : 'PULSE')}`);
console.log(`Wallet: ${account.address}`);
console.log(`Dry run: ${dryRun}`);
console.log('');

async function main() {
  const balance = await publicClient.getBalance({ address: account.address });
  console.log(`ETH balance: ${formatEther(balance)}`);
  
  const pulseBalance = await publicClient.readContract({
    address: PULSE,
    abi: [{ name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }] }],
    functionName: 'balanceOf',
    args: [account.address]
  });
  console.log(`PULSE balance: ${formatUnits(pulseBalance, 18)}`);
  console.log('');

  // PROBE MODE: Tiny test swap
  if (probe) {
    const PROBE_AMOUNT = parseUnits('10000', 18); // 10k PULSE
    
    if (pulseBalance < PROBE_AMOUNT) {
      console.error(`Insufficient PULSE for probe. Have ${formatUnits(pulseBalance, 18)}, need 10000`);
      process.exit(1);
    }
    
    console.log('=== PROBE MODE: 10,000 PULSE → ETH ===');
    
    const path = encodeWrapperPath(PULSE, WETH);
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 300);
    
    if (dryRun) {
      console.log('[DRY RUN] Would execute probe swap via wrapper');
      console.log(`Path: ${path}`);
      return;
    }
    
    console.log('Executing probe swap...');
    
    try {
      const beforeWeth = await publicClient.readContract({
        address: WETH,
        abi: [{ name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }] }],
        functionName: 'balanceOf',
        args: [account.address]
      });
      
      const hash = await walletClient.writeContract({
        address: SWAP_WRAPPER,
        abi: SWAP_WRAPPER_ABI,
        functionName: 'swapExactTokensForETH',
        args: [
          PROBE_AMOUNT,
          0n, // amountOutMin
          path,
          FEE_RECIPIENT_1,
          FEE_RECIPIENT_2,
          FEE_RECIPIENT_3,
          FEE_BIPS_1,
          FEE_BIPS_2,
          deadline,
        ],
      });
      
      console.log(`\nTx Hash: ${hash}`);
      console.log(`https://basescan.org/tx/${hash}`);
      
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      console.log(`\nStatus: ${receipt.status}`);
      console.log(`Gas Used: ${receipt.gasUsed.toString()}`);
      
      const afterWeth = await publicClient.readContract({
        address: WETH,
        abi: [{ name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }] }],
        functionName: 'balanceOf',
        args: [account.address]
      });
      
      const wethReceived = afterWeth - beforeWeth;
      console.log(`WETH received: ${formatUnits(wethReceived, 18)}`);
      console.log('\n✓ Probe swap successful!');
      
    } catch (err) {
      console.error('\n✗ Probe swap failed:', err.message || err);
      process.exit(1);
    }
    return;
  }

  // NORMAL SWAP MODE
  if (direction === 'buy') {
    // ETH → PULSE
    const amountIn = parseEther(amount);
    if (amountIn > balance) {
      console.error(`Insufficient ETH. Have ${formatEther(balance)}, need ${amount}`);
      process.exit(1);
    }
    
    console.log(`Swapping ${amount} ETH → PULSE`);
    
    const path = encodeWrapperPath(WETH, PULSE);
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 300);
    
    if (dryRun) {
      console.log('\n[DRY RUN] Would swap ETH for PULSE via wrapper');
      console.log(`Path: ${path}`);
      return;
    }
    
    try {
      const hash = await walletClient.writeContract({
        address: SWAP_WRAPPER,
        abi: SWAP_WRAPPER_ABI,
        functionName: 'swapExactETHForTokens',
        args: [
          0n, // amountOutMin
          path,
          FEE_RECIPIENT_1,
          FEE_RECIPIENT_2,
          FEE_RECIPIENT_3,
          FEE_BIPS_1,
          FEE_BIPS_2,
          deadline,
        ],
        value: amountIn,
      });
      
      console.log(`\nTx Hash: ${hash}`);
      console.log(`https://basescan.org/tx/${hash}`);
      
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      console.log(`\nStatus: ${receipt.status}`);
      console.log(`Gas Used: ${receipt.gasUsed.toString()}`);
      
      const newPulse = await publicClient.readContract({
        address: PULSE,
        abi: [{ name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }] }],
        functionName: 'balanceOf',
        args: [account.address]
      });
      
      console.log(`\nNew PULSE balance: ${formatUnits(newPulse, 18)}`);
      console.log(`PULSE received: ${formatUnits(newPulse - pulseBalance, 18)}`);
      
    } catch (err) {
      console.error('\nSwap failed:', err.message || err);
      process.exit(1);
    }
    
  } else {
    // PULSE → ETH
    const amountIn = parseUnits(amount, 18);
    if (amountIn > pulseBalance) {
      console.error(`Insufficient PULSE. Have ${formatUnits(pulseBalance, 18)}, need ${amount}`);
      process.exit(1);
    }
    
    console.log(`Swapping ${amount} PULSE → ETH`);
    
    const path = encodeWrapperPath(PULSE, WETH);
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 300);
    
    if (dryRun) {
      console.log('\n[DRY RUN] Would swap PULSE for ETH via wrapper');
      console.log(`Path: ${path}`);
      return;
    }
    
    try {
      const beforeEth = balance;
      
      const hash = await walletClient.writeContract({
        address: SWAP_WRAPPER,
        abi: SWAP_WRAPPER_ABI,
        functionName: 'swapExactTokensForETH',
        args: [
          amountIn,
          0n, // amountOutMin
          path,
          FEE_RECIPIENT_1,
          FEE_RECIPIENT_2,
          FEE_RECIPIENT_3,
          FEE_BIPS_1,
          FEE_BIPS_2,
          deadline,
        ],
      });
      
      console.log(`\nTx Hash: ${hash}`);
      console.log(`https://basescan.org/tx/${hash}`);
      
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      console.log(`\nStatus: ${receipt.status}`);
      console.log(`Gas Used: ${receipt.gasUsed.toString()}`);
      
      const afterEth = await publicClient.getBalance({ address: account.address });
      const ethReceived = afterEth - beforeEth;
      
      console.log(`ETH received: ${formatEther(ethReceived)}`);
      
    } catch (err) {
      console.error('\nSwap failed:', err.message || err);
      process.exit(1);
    }
  }
}

main().catch(console.error);
