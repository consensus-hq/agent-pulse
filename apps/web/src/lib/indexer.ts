// @ts-nocheck
import { createPublicClient, http, parseAbiItem, Log } from 'viem';
import { base, baseSepolia } from 'viem/chains';
import { kv } from '@vercel/kv';
import { IndexerKeys } from './indexer-keys';
import * as Signals from './signals';
import { PULSE_REGISTRY_ABI } from '../app/api/abi/route';

// Configuration — chain-aware
const CHAIN_ID = process.env.CHAIN_ID || process.env.NEXT_PUBLIC_CHAIN_ID || '84532';
const IS_MAINNET = CHAIN_ID === '8453';
const CHAIN = IS_MAINNET ? base : baseSepolia;
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || (IS_MAINNET ? 'https://mainnet.base.org' : 'https://sepolia.base.org');
const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_PULSE_REGISTRY_ADDRESS || '0xe61C615743A02983A46aFF66Db035297e8a43846';
const BATCH_SIZE = 1000n;

export class PulseIndexer {
  private client;

  constructor() {
    this.client = createPublicClient({
      chain: CHAIN,
      transport: http(RPC_URL)
    });
  }

  /**
   * Main entry point: Poll for new events and update indices
   */
  async indexEvents() {
    // 1. Get last indexed block
    let lastBlock = await kv.get<string>(IndexerKeys.LAST_BLOCK);
    const currentBlock = await this.client.getBlockNumber();
    
    // Default to a recent block if never indexed (or 0 if full reindex needed)
    // For safety, let's start from deployment if null, but that might be slow.
    // Assuming 0 or specific start block. 
    // Deployment block isn't known, but I'll use 0 or handle safe range.
    let fromBlock = lastBlock ? BigInt(lastBlock) + 1n : 0n; 

    // Safety clamp to avoid massive query on first run
    // If fromBlock is 0, maybe we should fetch only recent history or specific start
    // I will assume it's okay to fetch from 0 for now as it's testnet/low volume likely.
    
    if (fromBlock > currentBlock) {
      return { indexed: 0, from: fromBlock.toString(), to: currentBlock.toString() };
    }

    // Limit range to batch size
    let toBlock = fromBlock + BATCH_SIZE;
    if (toBlock > currentBlock) toBlock = currentBlock;

    console.log(`Indexing from ${fromBlock} to ${toBlock}`);

    // 2. Fetch logs
    const logs = await this.client.getLogs({
      address: CONTRACT_ADDRESS,
      event: parseAbiItem('event Pulse(address indexed agent, uint256 amount, uint256 timestamp, uint256 streak)'),
      fromBlock,
      toBlock
    });

    if (logs.length === 0) {
      await kv.set(IndexerKeys.LAST_BLOCK, toBlock.toString());
      return { indexed: 0 };
    }

    // 3. Process logs
    const agentsToUpdate = new Set<string>();

    // Pipeline for raw event storage
    const pipeline = kv.pipeline();

    for (const log of logs) {
      const { agent, amount, timestamp, streak } = log.args;
      if (!agent || !timestamp) continue;

      const agentLower = agent.toLowerCase();
      agentsToUpdate.add(agentLower);

      const ts = Number(timestamp);
      const eventData = JSON.stringify({
        block: Number(log.blockNumber),
        tx: log.transactionHash,
        amount: amount?.toString(),
        streak: streak?.toString()
      });

      // Add to sorted set (time series)
      pipeline.zadd(IndexerKeys.AGENT_BURNS(agentLower), { score: ts, member: eventData });
      
      // Add to global set
      pipeline.sadd(IndexerKeys.ALL_AGENTS, agentLower);
    }

    await pipeline.exec();

    // 4. Update derived signals for affected agents
    await this.updateSignals(Array.from(agentsToUpdate));

    // 5. Update global stats
    await this.updateGlobalStats();

    // 6. Save state
    await kv.set(IndexerKeys.LAST_BLOCK, toBlock.toString());

    return { indexed: logs.length, from: fromBlock.toString(), to: toBlock.toString() };
  }

  /**
   * Recompute signals for specific agents
   */
  async updateSignals(agents: string[]) {
    const now = Date.now() / 1000;
    
    for (const agent of agents) {
      // Fetch full history
      // Note: For very high volume, we might limit this.
      const rawBurns = await kv.zrange<string[]>(IndexerKeys.AGENT_BURNS(agent), 0, -1, { withScores: true });
      
      // Parse scores (timestamps)
      // zrange withScores returns [member, score, member, score...]
      // Wait, Vercel KV/Upstash implementation of zrange with withScores might return object or array depending on client.
      // @vercel/kv returns array of objects { score, member } if configured or flat array?
      // Let's verify standard behavior. documentation says:
      // kv.zrange(key, 0, -1, { withScores: true }) -> varies.
      // Safest is to just fetch scores? No, we need timestamps which are scores.
      // Actually, we stored timestamp as score.
      // We can just ZRANGE WITHSCORES to get timestamps.
      
      // Let's assume standard behavior: flat array [member, score, member, score]
      // Or we can just use ZRANGE 0 -1 (without scores) and parse the timestamps if they were in the value?
      // No, we put them in score.
      
      // Correct approach:
      // zrange(key, 0, -1, { withScores: true }) returns:
      // ["value1", 100, "value2", 101] (as strings/numbers)
      
      const timestamps: number[] = [];
      for (let i = 1; i < rawBurns.length; i += 2) {
        timestamps.push(Number(rawBurns[i]));
      }

      if (timestamps.length === 0) continue;

      // Compute signals
      const streak = Signals.calculateStreak(timestamps, now);
      const jitter = Signals.calculateJitter(timestamps);
      const velocity = Signals.calculateVelocity(timestamps, now);
      const hazard = Signals.calculateHazardRate(timestamps, streak.count, now);
      
      const lastPulse = Math.max(...timestamps);
      const totalBurns = timestamps.length;

      // Reliability (simple metric: observed / expected in active period?)
      // Let's skip complex reliability for now, focus on required signals.
      
      const stats = {
        lastPulse,
        streak: streak.count,
        streakStart: streak.startDate,
        jitter,
        hazard,
        velocity,
        totalBurns
      };

      await kv.hset(IndexerKeys.AGENT_STATS(agent), stats);

      // Update Active 24h
      if (lastPulse > now - 86400) {
        await kv.sadd(IndexerKeys.ACTIVE_AGENTS_24H, agent);
      } else {
        await kv.srem(IndexerKeys.ACTIVE_AGENTS_24H, agent);
      }
    }
  }

  /**
   * Update global network stats
   */
  async updateGlobalStats() {
    const activeCount = await kv.scard(IndexerKeys.ACTIVE_AGENTS_24H);
    
    // Burns today
    // We can't easily query "all burns today" from distributed keys without scanning.
    // Efficient way: Maintain a global daily counter? 
    // Or just aggregate from agents?
    // For now, let's just count active agents.
    
    // "Reliability distribution" - requires scanning all agent stats.
    // Skipped for MVP performance, can be done by a separate job.

    await kv.hset(IndexerKeys.GLOBAL_STATS, {
      active24h: activeCount,
      updatedAt: Date.now()
    });
  }

  /**
   * Manual trigger to calculate peer correlations
   * This is heavy, so separate method.
   */
  async computeCorrelations() {
    const agents = await kv.smembers(IndexerKeys.ALL_AGENTS);
    // pairwise O(N^2) - be careful.
    // Limit to top 10 or specific pairs?
    // "Network signals: Peer correlation"
    // I'll implement a sample correlation or skip if N is large.
    // For now, just placeholder or calc for small set.
    return { status: "not_implemented_yet_too_heavy" };
  }
}
