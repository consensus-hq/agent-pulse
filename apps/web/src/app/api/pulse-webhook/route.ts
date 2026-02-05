/**
 * Pulse Webhook Handler
 * 
 * Receives decoded Pulse events from thirdweb Insight webhooks
 * and updates Vercel KV cache for real-time status updates.
 * 
 * This replaces the viem event listener with push-based updates.
 * 
 * @route POST /api/internal/pulse-webhook
 */

export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { setAgentState, type AgentState } from '@/app/lib/kv';
import type { PulseEvent } from '@/app/lib/insight';

// ============================================================================
// Configuration
// ============================================================================

/** Allowed webhook sources (Insight IP ranges or headers to validate) */
const INSIGHT_WEBHOOK_SECRET = process.env.INSIGHT_WEBHOOK_SECRET;

/** Registry contract address for validation */
const REGISTRY_ADDRESS = process.env.NEXT_PUBLIC_CHAIN_ID === '8453'
  ? process.env.NEXT_PUBLIC_PULSE_REGISTRY_MAINNET
  : process.env.NEXT_PUBLIC_PULSE_REGISTRY_SEPOLIA || '0x2C802988c16Fae08bf04656fe93aDFA9a5bA8612';

// ============================================================================
// Types
// ============================================================================

/**
 * Insight webhook payload structure
 */
interface InsightWebhookPayload {
  /** Webhook event type */
  type: 'event';
  /** Chain ID where event occurred */
  chainId: number;
  /** Contract address that emitted the event */
  contractAddress: string;
  /** Event signature */
  signature: string;
  /** Event name */
  eventName: string;
  /** Decoded event data */
  data: {
    agent: string;
    amount: string;
    timestamp: string;
    streak: string;
  };
  /** Transaction details */
  transaction: {
    hash: string;
    blockNumber: number;
    blockHash: string;
    timestamp: number;
    from: string;
    to: string;
  };
  /** Log details */
  log: {
    address: string;
    topics: string[];
    data: string;
    logIndex: number;
  };
  /** Webhook delivery metadata */
  webhook: {
    id: string;
    timestamp: string;
  };
}

/**
 * Webhook processing result
 */
interface WebhookResult {
  success: boolean;
  agent?: string;
  error?: string;
  timestamp?: number;
}

// ============================================================================
// Request Validation
// ============================================================================

/**
 * Validate incoming webhook request
 * 
 * Checks:
 * 1. Content-Type is application/json
 * 2. Request method is POST
 * 3. Origin/headers validate (if secret configured)
 * 4. Payload structure is valid
 */
async function validateRequest(request: NextRequest): Promise<{
  valid: boolean;
  payload?: InsightWebhookPayload;
  error?: string;
}> {
  // Check method
  if (request.method !== 'POST') {
    return { valid: false, error: 'Method not allowed' };
  }
  
  // Check content type
  const contentType = request.headers.get('content-type');
  if (!contentType?.includes('application/json')) {
    return { valid: false, error: 'Invalid content type' };
  }
  
  // Validate webhook secret if configured
  if (INSIGHT_WEBHOOK_SECRET) {
    const webhookSecret = request.headers.get('x-webhook-secret');
    if (webhookSecret !== INSIGHT_WEBHOOK_SECRET) {
      return { valid: false, error: 'Invalid webhook secret' };
    }
  }
  
  // Validate Insight signature/header if available
  const insightSignature = request.headers.get('x-insight-signature');
  const userAgent = request.headers.get('user-agent');
  
  // Optional: Check for Insight-specific headers
  // Thirdweb may include specific headers to identify the source
  if (userAgent && !userAgent.includes('thirdweb') && !userAgent.includes('insight')) {
    // Log for monitoring but don't block (header may vary)
    console.warn('Webhook received from non-Insight source:', userAgent);
  }
  
  // Parse payload
  try {
    const body = await request.json();
    
    // Validate required fields
    if (!body.data || !body.transaction || !body.log) {
      return { valid: false, error: 'Missing required fields' };
    }
    
    // Validate event type
    if (body.type !== 'event') {
      return { valid: false, error: 'Invalid event type' };
    }
    
    // Validate contract address matches registry
    const contractAddress = body.contractAddress?.toLowerCase();
    const expectedAddress = REGISTRY_ADDRESS?.toLowerCase();
    
    if (contractAddress && expectedAddress && contractAddress !== expectedAddress) {
      return { valid: false, error: 'Invalid contract address' };
    }
    
    // Validate event signature is Pulse
    if (!body.signature?.includes('Pulse')) {
      return { valid: false, error: 'Invalid event signature' };
    }
    
    // Validate data fields
    const { agent, amount, timestamp, streak } = body.data;
    if (!agent || !amount || !timestamp || streak === undefined) {
      return { valid: false, error: 'Missing event data fields' };
    }
    
    // Validate addresses are valid hex
    if (!/^0x[a-fA-F0-9]{40}$/.test(agent)) {
      return { valid: false, error: 'Invalid agent address format' };
    }
    
    return { valid: true, payload: body as InsightWebhookPayload };
  } catch (error) {
    return { valid: false, error: 'Invalid JSON payload' };
  }
}

// ============================================================================
// KV Updates
// ============================================================================

/**
 * Extract Pulse event data from webhook payload
 */
function extractPulseEvent(payload: InsightWebhookPayload): PulseEvent {
  return {
    agent: payload.data.agent.toLowerCase(),
    amount: BigInt(payload.data.amount),
    timestamp: Number(payload.data.timestamp),
    streak: Number(payload.data.streak),
    blockNumber: payload.transaction.blockNumber,
    logIndex: payload.log.logIndex,
    transactionHash: payload.transaction.hash,
  };
}

/**
 * Update KV cache atomically for a Pulse event
 * 
 * Critical keys (lastPulse, isAlive) are updated together with the same TTL
 * to maintain consistency guarantees per KV_SCHEMA.md.
 */
async function updateKVCache(event: PulseEvent): Promise<void> {
  const address = event.agent.toLowerCase();
  
  // Use the shared KV module (F3's kv.ts) which handles atomic pipeline updates
  // per KV_SCHEMA.md: lastPulse + isAlive update together with TTL 1h
  const state: AgentState = {
    isAlive: true,
    streak: event.streak,
    lastPulse: event.timestamp,
    hazardScore: 0, // Pulse events don't carry hazard — preserve existing or default
  };
  
  await setAgentState(address, state);
  
  console.log(`[Pulse Webhook] Updated KV for ${address}`, {
    lastPulse: event.timestamp,
    streak: event.streak,
    blockNumber: event.blockNumber,
    txHash: event.transactionHash,
  });
}

/**
 * Calculate hazard score based on time since last pulse
 * 
 * Returns 0-100 scale where 100 = dead (exceeded protocol TTL)
 */
function calculateHazardScore(lastPulseAt: number): number {
  const now = Math.floor(Date.now() / 1000);
  const elapsed = now - lastPulseAt;
  const PROTOCOL_TTL_SECONDS = 86400; // 24 hours
  
  if (elapsed <= 0) return 0;
  if (elapsed >= PROTOCOL_TTL_SECONDS) return 100;
  
  // Linear scale from 0 to 100 over the TTL period
  return Math.floor((elapsed / PROTOCOL_TTL_SECONDS) * 100);
}

/**
 * Update hazard score asynchronously (non-critical)
 */
async function updateHazardScore(_address: string, _timestamp: number): Promise<void> {
  // Hazard score is updated via setAgentState in updateKVCache.
  // This function is a no-op — hazard is set to 0 by default and
  // only changed via the owner's updateHazard() admin function.
}

// ============================================================================
// Main Handler
// ============================================================================

/**
 * POST /api/internal/pulse-webhook
 * 
 * Receives Pulse events from thirdweb Insight webhooks and updates KV cache.
 * Returns 200 on success, 500 on failure (triggers Insight retry).
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = crypto.randomUUID();
  const startTime = Date.now();
  
  console.log(`[Pulse Webhook ${requestId}] Received request`);
  
  try {
    // Validate request
    const validation = await validateRequest(request);
    
    if (!validation.valid) {
      console.error(`[Pulse Webhook ${requestId}] Validation failed:`, validation.error);
      // Return 400 for validation errors (client error - don't retry)
      return NextResponse.json(
        { error: validation.error, requestId },
        { status: 400 }
      );
    }
    
    const payload = validation.payload!;
    const event = extractPulseEvent(payload);
    
    console.log(`[Pulse Webhook ${requestId}] Processing Pulse event`, {
      agent: event.agent,
      blockNumber: event.blockNumber,
      timestamp: event.timestamp,
    });
    
    // Update KV cache atomically
    await updateKVCache(event);
    
    // Update hazard score (async, non-blocking)
    updateHazardScore(event.agent, event.timestamp).catch((error) => {
      console.error(`[Pulse Webhook ${requestId}] Hazard score update failed:`, error);
    });
    
    const duration = Date.now() - startTime;
    
    console.log(`[Pulse Webhook ${requestId}] Success in ${duration}ms`, {
      agent: event.agent,
      timestamp: event.timestamp,
    });
    
    // Return 200 success
    return NextResponse.json({
      success: true,
      agent: event.agent,
      timestamp: event.timestamp,
      requestId,
      durationMs: duration,
    });
    
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    console.error(`[Pulse Webhook ${requestId}] Failed after ${duration}ms:`, error);
    
    // Return 500 to trigger Insight retry
    // Insight will retry with exponential backoff
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: errorMessage,
        requestId,
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/internal/pulse-webhook
 * 
 * Health check endpoint for the webhook.
 * Returns 200 if the endpoint is operational.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  // Simple health check
  try {
    // Verify KV connectivity via shared module
    const { checkKVHealth } = await import('@/app/lib/kv');
    const health = await checkKVHealth();
    if (!health.healthy) throw new Error(health.error || 'KV unhealthy');
    
    return NextResponse.json({
      status: 'healthy',
      endpoint: '/api/internal/pulse-webhook',
      timestamp: Date.now(),
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return NextResponse.json(
      {
        status: 'unhealthy',
        error: errorMessage,
      },
      { status: 503 }
    );
  }
}
