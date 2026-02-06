/**
 * Check and optionally claim Clanker LP rewards for PULSE token.
 * 
 * Usage:
 *   npx tsx scripts/check-rewards.ts          # check only
 *   npx tsx scripts/check-rewards.ts --claim   # check + claim
 */
import { Clanker } from 'clanker-sdk/v4';
import { createPublicClient, createWalletClient, http, formatEther, type PublicClient } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';
import * as fs from 'fs';

// Config
const PULSE_TOKEN = '0x21111B39A502335aC7e45c4574Dd083A69258b07' as const;
const TREASURY_SAFE = '0xA7940a42c30A7F492Ed578F3aC728c2929103E43' as const;
const DEPLOYER = '0x9508752Ba171D37EBb3AA437927458E0a21D1e04' as const;
const WETH = '0x4200000000000000000000000000000000000006' as const;
const RPC_URL = 'https://mainnet.base.org';

// Load deployer key
const keyPath = '/opt/fundbot/work/workspace-connie/secrets/wallets/connie.core-mainnet.key.json';
const keyData = JSON.parse(fs.readFileSync(keyPath, 'utf-8'));
const raw = keyData.privateKey as string;
const PRIVATE_KEY = (raw.startsWith('0x') ? raw : `0x${raw}`) as `0x${string}`;

const account = privateKeyToAccount(PRIVATE_KEY);
const publicClient = createPublicClient({ chain: base, transport: http(RPC_URL) }) as PublicClient;
const wallet = createWalletClient({ account, chain: base, transport: http(RPC_URL) });
const clanker = new Clanker({ wallet, publicClient });

const shouldClaim = process.argv.includes('--claim');

async function main() {
  console.log('=== PULSE LP Reward Check ===\n');
  console.log(`Token:     ${PULSE_TOKEN}`);
  console.log(`Treasury:  ${TREASURY_SAFE}`);
  console.log(`Deployer:  ${DEPLOYER}`);
  console.log('');

  // Check available rewards for Treasury Safe
  try {
    console.log('--- Checking rewards for Treasury Safe ---');
    const rewardTx = await clanker.getAvailableRewardsTransaction({
      token: PULSE_TOKEN,
      rewardRecipient: TREASURY_SAFE,
    });
    
    // The tx object contains the fee locker contract address and ABI
    // We can read feesToClaim directly
    const feeLockerAddress = rewardTx.address;
    console.log(`Fee Locker: ${feeLockerAddress}`);
    
    // Read WETH fees
    const wethFees = await publicClient.readContract({
      address: feeLockerAddress,
      abi: rewardTx.abi,
      functionName: 'feesToClaim',
      args: [TREASURY_SAFE, WETH],
    }) as bigint;
    
    // Read PULSE fees  
    const pulseFees = await publicClient.readContract({
      address: feeLockerAddress,
      abi: rewardTx.abi,
      functionName: 'feesToClaim',
      args: [TREASURY_SAFE, PULSE_TOKEN],
    }) as bigint;

    console.log(`\nAccrued WETH rewards:  ${formatEther(wethFees)} WETH`);
    console.log(`Accrued PULSE rewards: ${formatEther(pulseFees)} PULSE`);
    
    const hasRewards = wethFees > 0n || pulseFees > 0n;
    
    if (!hasRewards) {
      console.log('\nNo rewards to claim yet. Fees accrue from trading activity.');
    }

    if (shouldClaim && hasRewards) {
      console.log('\n--- Claiming rewards ---');
      const result = await clanker.claimRewards({
        token: PULSE_TOKEN,
        rewardRecipient: TREASURY_SAFE,
      });
      
      if (result.error) {
        console.error('Claim error:', result.error);
      } else {
        console.log(`✅ Rewards claimed! TX: https://basescan.org/tx/${result.txHash}`);
      }
    } else if (shouldClaim && !hasRewards) {
      console.log('\nNothing to claim.');
    } else if (hasRewards) {
      console.log('\nRun with --claim to collect these rewards.');
    }
    
  } catch (err: any) {
    console.error('Error checking rewards:', err.message || err);
    
    // Fallback: try to read the fee locker directly via known Clanker addresses
    console.log('\nAttempting direct contract read...');
    try {
      // Clanker V4 fee locker on Base
      const CLANKER_FEE_LOCKER = '0x2222222222222222222222222222222222222222'; // placeholder
      console.log('Need to find the actual fee locker address from the deploy TX.');
      console.log(`Check: https://basescan.org/tx/0x5bee30aeff8df895cb7de05321efb103ad776f1a3a9b7dd72fb8f385d887e61a`);
    } catch (e2: any) {
      console.error('Fallback also failed:', e2.message);
    }
  }

  // Also check vault claimable (devBuy vested tokens)
  console.log('\n--- Checking vaulted tokens ---');
  try {
    const vaultAmount = await clanker.getVaultClaimableAmount({ token: PULSE_TOKEN });
    console.log(`Vault claimable: ${formatEther(vaultAmount)} PULSE`);
    
    if (vaultAmount > 0n && shouldClaim) {
      console.log('Claiming vaulted tokens...');
      const vaultResult = await clanker.claimVaultedTokens({ token: PULSE_TOKEN });
      if (vaultResult.error) {
        console.error('Vault claim error:', vaultResult.error);
      } else {
        console.log(`✅ Vaulted tokens claimed! TX: https://basescan.org/tx/${vaultResult.txHash}`);
      }
    }
  } catch (err: any) {
    console.log(`Vault check: ${err.message || 'No vault configured'}`);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
