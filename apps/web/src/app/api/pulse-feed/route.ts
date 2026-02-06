/**
 * Pulse Feed API Route
 * 
 * Returns paginated Pulse events using thirdweb Insight API.
 * This is the primary feed for the UI, leaderboard, and analytics.
 * 
 * NO LOCAL STORAGE - Insight IS the source of truth for historical data.
 * 
 * @route GET /api/pulse/feed
 */

export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { getPulseEvents, InsightError } from '@/app/lib/insight';

// ============================================================================
// Configuration
// ============================================================================

/** Maximum allowed limit per request */
const MAX_LIMIT = 100;

/** Default limit */
const DEFAULT_LIMIT = 50;

/** Maximum allowed page number */
const MAX_PAGE = 1000;

// ============================================================================
// Types
// ============================================================================

/**
 * Feed query parameters
 */
interface FeedQueryParams {
  /** Filter by specific agent address */
  agent?: string;
  /** Number of results (1-100) */
  limit: number;
  /** Page number (0-indexed) */
  page: number;
  /** Sort order */
  sort: 'asc' | 'desc';
}

/**
 * Feed response item
 */
interface FeedItem {
  /** Agent address */
  agent: string;
  /** Pulse amount in wei */
  amount: string;
  /** Unix timestamp */
  timestamp: number;
  /** Current streak */
  streak: number;
  /** Block number */
  blockNumber: number;
  /** Transaction hash */
  transactionHash: string;
  /** Log index */
  logIndex: number;
  /** Human-readable timestamp */
  timestampFormatted: string;
}

/**
 * Feed response
 */
interface FeedResponse {
  /** Feed items */
  data: FeedItem[];
  /** Pagination metadata */
  pagination: {
    page: number;
    limit: number;
    totalEvents: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
  /** Response metadata */
  meta: {
    requestId: string;
    durationMs: number;
    timestamp: number;
  };
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate and parse query parameters
 */
function parseQueryParams(searchParams: URLSearchParams): {
  valid: boolean;
  params?: FeedQueryParams;
  error?: string;
} {
  // Parse agent filter
  const agent = searchParams.get('agent');
  if (agent && !/^0x[a-fA-F0-9]{40}$/.test(agent)) {
    return { valid: false, error: 'Invalid agent address format' };
  }
  
  // Parse limit
  let limit = DEFAULT_LIMIT;
  const limitParam = searchParams.get('limit');
  if (limitParam) {
    const parsed = parseInt(limitParam, 10);
    if (isNaN(parsed) || parsed < 1 || parsed > MAX_LIMIT) {
      return { valid: false, error: `Limit must be between 1 and ${MAX_LIMIT}` };
    }
    limit = parsed;
  }
  
  // Parse page
  let page = 0;
  const pageParam = searchParams.get('page');
  if (pageParam) {
    const parsed = parseInt(pageParam, 10);
    if (isNaN(parsed) || parsed < 0 || parsed > MAX_PAGE) {
      return { valid: false, error: `Page must be between 0 and ${MAX_PAGE}` };
    }
    page = parsed;
  }
  
  // Parse sort order
  let sort: 'asc' | 'desc' = 'desc';
  const sortParam = searchParams.get('sort');
  if (sortParam) {
    if (sortParam !== 'asc' && sortParam !== 'desc') {
      return { valid: false, error: 'Sort must be "asc" or "desc"' };
    }
    sort = sortParam;
  }
  
  return {
    valid: true,
    params: {
      agent: agent || undefined,
      limit,
      page,
      sort,
    },
  };
}

// ============================================================================
// Response Formatting
// ============================================================================

/**
 * Format timestamp to human-readable string
 */
function formatTimestamp(timestamp: number): string {
  try {
    return new Date(timestamp * 1000).toISOString();
  } catch {
    return 'Invalid date';
  }
}

/**
 * Transform PulseEvent to FeedItem
 */
function formatFeedItem(event: {
  agent: string;
  amount: bigint;
  timestamp: number;
  streak: number;
  totalBurned?: bigint;
  blockNumber: number;
  logIndex: number;
  transactionHash: string;
}): FeedItem {
  return {
    agent: event.agent,
    amount: event.amount.toString(),
    timestamp: event.timestamp,
    streak: event.streak,
    blockNumber: event.blockNumber,
    transactionHash: event.transactionHash,
    logIndex: event.logIndex,
    timestampFormatted: formatTimestamp(event.timestamp),
  };
}

// ============================================================================
// Main Handler
// ============================================================================

/**
 * GET /api/pulse/feed
 * 
 * Returns paginated Pulse events from thirdweb Insight API.
 * Query params:
 * - agent: Filter by agent address (optional)
 * - limit: Number of results (default 50, max 100)
 * - page: Page number (default 0)
 * - sort: Sort order 'asc' or 'desc' (default 'desc')
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestId = crypto.randomUUID();
  const startTime = Date.now();
  
  // Parse query parameters
  const { searchParams } = new URL(request.url);
  const parsing = parseQueryParams(searchParams);
  
  if (!parsing.valid) {
    return NextResponse.json(
      {
        error: parsing.error,
        requestId,
      },
      { status: 400 }
    );
  }
  
  const params = parsing.params!;
  
  try {
    // Fetch events from Insight API
    const result = await getPulseEvents({
      agent: params.agent,
      limit: params.limit,
      page: params.page,
      sortOrder: params.sort,
    });
    
    // Transform to feed format
    const feedItems = result.data.map(formatFeedItem);
    
    const duration = Date.now() - startTime;
    
    const response: FeedResponse = {
      data: feedItems,
      pagination: {
        page: result.meta.page,
        limit: result.meta.limit,
        totalEvents: result.meta.totalEvents,
        totalPages: result.meta.totalPages,
        hasNextPage: result.meta.hasNextPage,
        hasPreviousPage: params.page > 0,
      },
      meta: {
        requestId,
        durationMs: duration,
        timestamp: Math.floor(Date.now() / 1000),
      },
    };
    
    // Set cache headers for edge caching
    // Short TTL (10s) since this is real-time data
    const headers = new Headers();
    headers.set('Cache-Control', 'public, max-age=10, stale-while-revalidate=30');
    headers.set('Vercel-CDN-Cache-Control', 'max-age=10');
    headers.set('CDN-Cache-Control', 'max-age=10');
    
    return NextResponse.json(response, { headers });
    
  } catch (error) {
    const duration = Date.now() - startTime;
    
    // Handle specific error types
    if (error instanceof InsightError) {
      // Check if it's a client ID error
      if (error.code === 'MISSING_CLIENT_ID') {
        return NextResponse.json(
          {
            error: 'Server configuration error',
            message: 'Thirdweb client ID not configured',
            requestId,
            durationMs: duration,
          },
          { status: 500 }
        );
      }
      
      // API error
      if (error.code === 'API_ERROR') {
        return NextResponse.json(
          {
            error: 'Upstream API error',
            message: error.message,
            requestId,
            durationMs: duration,
          },
          { status: 502 }
        );
      }
    }
    
    // Generic error
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    console.error(`[Pulse Feed ${requestId}] Error:`, error);
    
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: errorMessage,
        requestId,
        durationMs: duration,
      },
      { status: 500 }
    );
  }
}

// ============================================================================
// Options Handler (CORS)
// ============================================================================

/**
 * OPTIONS /api/pulse/feed
 * 
 * Handle CORS preflight requests.
 */
export async function OPTIONS(request: NextRequest): Promise<NextResponse> {
  const headers = new Headers();
  
  // Allow all origins (adjust for production)
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  headers.set('Access-Control-Max-Age', '86400');
  
  return new NextResponse(null, { status: 204, headers });
}
