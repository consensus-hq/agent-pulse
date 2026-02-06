import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

/**
 * Auth Status API Route
 * 
 * Returns the current authentication status for agent detection.
 * Note: This is a client-side wallet authentication pattern using
 * RainbowKit/WalletConnect. This endpoint documents the expected
 * response format for agents checking auth status.
 * 
 * Real authentication state is managed client-side via wagmi/rainbowkit
 * hooks (useAccount, useConnect, etc.). This endpoint provides:
 * 
 * 1. A standardized way for agents to check if the API expects auth
 * 2. Documentation of the auth pattern used by this application
 * 3. Future extensibility for server-side session validation
 * 
 * @route GET /api/auth/status
 * @returns { authenticated: boolean, method: string }
 */

export interface AuthStatusResponse {
  /** Whether the user is authenticated */
  authenticated: boolean;
  /** Authentication method used */
  method: "wallet_connect" | "none";
  /** Chain ID if authenticated */
  chainId?: number;
  /** Timestamp of the response */
  timestamp: number;
  /** Documentation for agents */
  docs: {
    /** How to detect auth state client-side */
    detection: string;
    /** DOM attribute to check */
    domAttribute: string;
    /** Expected values for the attribute */
    domValues: string[];
  };
}

export interface AuthStatusError {
  error: string;
  timestamp: number;
}

/**
 * GET /api/auth/status
 * 
 * Returns authentication status. Since this app uses client-side
 * wallet authentication, this endpoint always returns authenticated: false
 * and provides instructions for detecting auth state via DOM.
 */
export async function GET(
  request: NextRequest
): Promise<NextResponse<AuthStatusResponse | AuthStatusError>> {
  const requestId = crypto.randomUUID();
  const timestamp = Date.now();

  try {
    // This app uses client-side wallet authentication
    // The actual auth state is determined by:
    // 1. DOM attribute: data-auth-status on the wallet panel
    // 2. RainbowKit's useAccount hook (isConnected, address)
    // 3. WalletConnect session state
    
    const response: AuthStatusResponse = {
      authenticated: false,
      method: "wallet_connect",
      timestamp,
      docs: {
        detection: "Check DOM element with data-auth-status attribute",
        domAttribute: "data-auth-status",
        domValues: ["connected", "disconnected", "connecting"],
      },
    };

    return NextResponse.json(response, {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        "X-Request-Id": requestId,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    
    console.error(`[Auth Status ${requestId}] Error:`, error);
    
    return NextResponse.json(
      {
        error: errorMessage,
        timestamp,
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store",
          "X-Request-Id": requestId,
        },
      }
    );
  }
}

/**
 * OPTIONS /api/auth/status
 * 
 * Handle CORS preflight requests.
 */
export async function OPTIONS(request: NextRequest): Promise<NextResponse> {
  const headers = new Headers();
  
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  headers.set("Access-Control-Max-Age", "86400");
  
  return new NextResponse(null, { status: 204, headers });
}
