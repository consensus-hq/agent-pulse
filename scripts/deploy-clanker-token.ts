/**
 * Deploy PULSE token via Clanker SDK v4 on Base mainnet.
 * Creates token + Uniswap V4 liquidity pool in one transaction.
 * 
 * Usage: npx tsx scripts/deploy-clanker-token.ts
 */
import { Clanker } from 'clanker-sdk/v4';
import { POOL_POSITIONS, FEE_CONFIGS } from 'clanker-sdk';
import { createPublicClient, createWalletClient, http, type PublicClient, parseEther, formatEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';
import * as fs from 'fs';
import * as path from 'path';

// Load deployer key
const keyPath = '/opt/fundbot/work/workspace-connie/secrets/wallets/connie.core-mainnet.key.json';
const keyData = JSON.parse(fs.readFileSync(keyPath, 'utf-8'));
const raw = keyData.privateKey as string;
const PRIVATE_KEY = (raw.startsWith('0x') ? raw : `0x${raw}`) as `0x${string}`;

const account = privateKeyToAccount(PRIVATE_KEY);
const TREASURY_SAFE = '0xA7940a42c30A7F492Ed578F3aC728c2929103E43' as const;

console.log(`Deployer: ${account.address}`);
console.log(`Treasury: ${TREASURY_SAFE}`);

const RPC_URL = 'https://mainnet.base.org';

const publicClient = createPublicClient({
  chain: base,
  transport: http(RPC_URL),
}) as PublicClient;

const wallet = createWalletClient({
  account,
  chain: base,
  transport: http(RPC_URL),
});

const clanker = new Clanker({ wallet, publicClient });

async function main() {
  // Check balance first
  const balance = await publicClient.getBalance({ address: account.address });
  console.log(`\nDeployer ETH balance: ${formatEther(balance)} ETH`);
  
  if (balance < parseEther('0.003')) {
    console.error('ERROR: Insufficient ETH for deployment + devBuy. Need at least 0.003 ETH.');
    process.exit(1);
  }

  console.log('\n=== Deploying PULSE via Clanker V4 ===\n');

  // devBuy amount — small to conserve gas for contract redeployments
  const devBuyEth = 0.002;
  
  console.log(`Token: Agent Pulse (PULSE)`);
  console.log(`Pool: WETH paired, Standard positions, StaticBasic fees`);
  console.log(`Rewards: 100% to Treasury Safe`);
  console.log(`DevBuy: ${devBuyEth} ETH`);
  console.log(`Vanity: enabled`);
  console.log('');

  const result = await clanker.deploy({
    chainId: base.id,
    name: 'Agent Pulse',
    symbol: 'PULSE',
    image: 'ipfs://bafkreihxwfnokgoevmcl6icz5c3adua3sclq62aqaio4klyacjyzrqxkse',
    tokenAdmin: account.address,
    metadata: {
      description: 'On-chain liveness signal for AI agents. Pulse to prove you are alive.',
      socialMediaUrls: [
        { platform: 'twitter', url: 'https://x.com/PulseOnBase' },
      ],
    },
    context: {
      interface: 'Clanker SDK',
    },
    // Route 100% of LP trading fees to Treasury Safe
    rewards: {
      recipients: [
        {
          recipient: TREASURY_SAFE,
          admin: account.address,
          bps: 10000, // 100% to treasury
          token: 'Both',
        },
      ],
    },
    // Small dev buy for initial trading activity
    devBuy: {
      ethAmount: devBuyEth,
      recipient: account.address,
    },
    pool: {
      pairedToken: '0x4200000000000000000000000000000000000006', // WETH on Base
      positions: POOL_POSITIONS.Standard,
    },
    fees: FEE_CONFIGS.StaticBasic,
    vanity: true,
  });

  if (result.error) {
    console.error('Deploy error:', result.error);
    process.exit(1);
  }

  console.log(`TX submitted: https://basescan.org/tx/${result.txHash}`);
  console.log('Waiting for confirmation...');

  const deployed = await result.waitForTransaction();
  console.log(`\n✅ PULSE token deployed!`);
  console.log(`Token address: ${deployed.address}`);
  console.log(`BaseScan: https://basescan.org/address/${deployed.address}`);
  console.log(`TX: https://basescan.org/tx/${result.txHash}`);

  // Write result to file for downstream scripts
  const output = {
    tokenAddress: deployed.address,
    txHash: result.txHash,
    deployer: account.address,
    treasury: TREASURY_SAFE,
    chain: 'base',
    chainId: 8453,
    deployedAt: new Date().toISOString(),
    devBuyEth,
    note: 'Clanker V4 deployment with Uniswap V4 pool',
  };

  const outputPath = path.join(__dirname, '..', 'clanker-deploy-result.json');
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`\nResult saved to: ${outputPath}`);

  // Also print for easy copy-paste into env
  console.log(`\n--- Environment Variables ---`);
  console.log(`NEXT_PUBLIC_PULSE_TOKEN_ADDRESS=${deployed.address}`);
  console.log(`NEXT_PUBLIC_CHAIN_ID=8453`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
