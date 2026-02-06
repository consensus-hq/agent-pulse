import { NextRequest, NextResponse } from "next/server";
import { getAgentState } from "@/app/lib/kv";
import { readAgentStatus, readTTL } from "@/app/lib/chain";

export const runtime = "edge";

// ============================================================================
// Types
// ============================================================================

interface BadgeData {
  status: "alive" | "dead" | "unknown";
  streak: number;
  hazardLevel: "low" | "medium" | "high" | "critical" | "unknown";
}

// ============================================================================
// Utility Functions
// ============================================================================

function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

function normalizeAddress(address: string): string {
  return address.toLowerCase();
}

function calculateHazardScore(lastPulseAt: number, protocolTtlSeconds: number): number {
  const now = Math.floor(Date.now() / 1000);
  const elapsed = now - lastPulseAt;
  if (elapsed <= 0) return 0;
  if (elapsed >= protocolTtlSeconds) return 100;
  return Math.floor((elapsed / protocolTtlSeconds) * 100);
}

function hazardLevel(score: number): "low" | "medium" | "high" | "critical" {
  if (score <= 25) return "low";
  if (score <= 50) return "medium";
  if (score <= 75) return "high";
  return "critical";
}

// ============================================================================
// SVG Badge Generator
// ============================================================================

/**
 * Escape XML special characters to prevent injection
 */
function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Approximate text width for Verdana 11px (shields.io standard).
 * Uses character-class widths for reasonable accuracy without canvas measurement.
 */
function measureText(text: string): number {
  let width = 0;
  for (const ch of text) {
    if (/[A-Z]/.test(ch)) width += 7.5;
    else if (/[a-z]/.test(ch)) width += 6.1;
    else if (/[0-9]/.test(ch)) width += 6.5;
    else if (ch === " ") width += 3.3;
    else if (ch === ":") width += 3.0;
    else width += 6.0;
  }
  return Math.ceil(width);
}

function generateBadgeSvg(data: BadgeData): string {
  // Colour scheme
  const statusColor =
    data.status === "alive"
      ? "#4c1"     // bright green
      : data.status === "dead"
        ? "#e05d44" // red
        : "#9f9f9f"; // grey for unknown

  const hazardColor =
    data.hazardLevel === "low"
      ? "#4c1"
      : data.hazardLevel === "medium"
        ? "#dfb317"
        : data.hazardLevel === "high"
          ? "#fe7d37"
          : data.hazardLevel === "critical"
            ? "#e05d44"
            : "#9f9f9f";

  // Dot indicator
  const dotColor = data.status === "alive" ? "#4c1" : data.status === "dead" ? "#e05d44" : "#9f9f9f";

  // Text segments
  const labelText = "Agent Pulse";
  const statusText = data.status === "unknown" ? "unknown" : data.status;
  const streakText = `Streak: ${data.streak}`;
  const hazardText = data.hazardLevel;

  // Measure widths (with padding)
  const dotWidth = 14; // circle + gap
  const labelWidth = measureText(labelText) + dotWidth + 12; // dot + padding
  const statusWidth = measureText(statusText) + 12;
  const streakWidth = measureText(streakText) + 12;
  const hazardWidth = measureText(hazardText) + 12;

  const totalWidth = labelWidth + statusWidth + streakWidth + hazardWidth;
  const height = 20;
  const radius = 3;

  // Build section x positions
  const x0 = 0;
  const x1 = labelWidth;
  const x2 = x1 + statusWidth;
  const x3 = x2 + streakWidth;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${height}" role="img" aria-label="${escapeXml(labelText)}: ${escapeXml(statusText)} | ${escapeXml(streakText)} | ${escapeXml(hazardText)}">
  <title>${escapeXml(labelText)}: ${escapeXml(statusText)} | ${escapeXml(streakText)} | ${escapeXml(hazardText)}</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r">
    <rect width="${totalWidth}" height="${height}" rx="${radius}" fill="#fff"/>
  </clipPath>
  <g clip-path="url(#r)">
    <!-- Label section -->
    <rect width="${labelWidth}" height="${height}" fill="#555"/>
    <!-- Status section -->
    <rect x="${x1}" width="${statusWidth}" height="${height}" fill="${statusColor}"/>
    <!-- Streak section -->
    <rect x="${x2}" width="${streakWidth}" height="${height}" fill="#007ec6"/>
    <!-- Hazard section -->
    <rect x="${x3}" width="${hazardWidth}" height="${height}" fill="${hazardColor}"/>
    <!-- Gradient overlay -->
    <rect width="${totalWidth}" height="${height}" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="11">
    <!-- Status dot -->
    <circle cx="${x0 + 9}" cy="${height / 2}" r="4" fill="${dotColor}" stroke="#fff" stroke-width="0.5"/>
    <!-- Label -->
    <text x="${x0 + dotWidth + (labelWidth - dotWidth) / 2}" y="${height - 5.5}" fill="#010101" fill-opacity=".3">${escapeXml(labelText)}</text>
    <text x="${x0 + dotWidth + (labelWidth - dotWidth) / 2}" y="${height - 6.5}">${escapeXml(labelText)}</text>
    <!-- Status -->
    <text x="${x1 + statusWidth / 2}" y="${height - 5.5}" fill="#010101" fill-opacity=".3">${escapeXml(statusText)}</text>
    <text x="${x1 + statusWidth / 2}" y="${height - 6.5}">${escapeXml(statusText)}</text>
    <!-- Streak -->
    <text x="${x2 + streakWidth / 2}" y="${height - 5.5}" fill="#010101" fill-opacity=".3">${escapeXml(streakText)}</text>
    <text x="${x2 + streakWidth / 2}" y="${height - 6.5}">${escapeXml(streakText)}</text>
    <!-- Hazard -->
    <text x="${x3 + hazardWidth / 2}" y="${height - 5.5}" fill="#010101" fill-opacity=".3">${escapeXml(hazardText)}</text>
    <text x="${x3 + hazardWidth / 2}" y="${height - 6.5}">${escapeXml(hazardText)}</text>
  </g>
</svg>`;
}

// ============================================================================
// Data Fetching
// ============================================================================

async function fetchBadgeData(address: string): Promise<BadgeData> {
  // 1. Try KV cache first
  const cached = await getAgentState(address);

  if (cached !== null) {
    return {
      status: cached.isAlive ? "alive" : "dead",
      streak: cached.streak,
      hazardLevel: hazardLevel(cached.hazardScore),
    };
  }

  // 2. Cache miss — read from chain
  const [chainStatus, ttlResult] = await Promise.all([
    readAgentStatus(address),
    readTTL(),
  ]);

  if (chainStatus === null) {
    return { status: "unknown", streak: 0, hazardLevel: "unknown" };
  }

  const ttlSeconds = ttlResult ? Number(ttlResult) : 86400;
  const lastPulse = Number(chainStatus.lastPulseAt);
  const hScore = calculateHazardScore(lastPulse, ttlSeconds);

  return {
    status: chainStatus.alive ? "alive" : "dead",
    streak: Number(chainStatus.streak),
    hazardLevel: hazardLevel(hScore),
  };
}

// ============================================================================
// Route Handler
// ============================================================================

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ address: string }> },
): Promise<Response> {
  const { address: rawAddress } = await params;
  const address = normalizeAddress(rawAddress);

  // Invalid address → return "unknown" badge immediately (no chain call)
  if (!isValidAddress(address)) {
    const svg = generateBadgeSvg({ status: "unknown", streak: 0, hazardLevel: "unknown" });
    return new Response(svg, {
      status: 200,
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=300",
        "X-Badge-Status": "invalid-address",
      },
    });
  }

  try {
    const data = await fetchBadgeData(address);
    const svg = generateBadgeSvg(data);

    return new Response(svg, {
      status: 200,
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=300",
        "X-Badge-Status": data.status,
      },
    });
  } catch (err) {
    console.error("[badge] Error generating badge:", err);

    // On error, return a graceful "unknown" badge rather than a broken image
    const svg = generateBadgeSvg({ status: "unknown", streak: 0, hazardLevel: "unknown" });
    return new Response(svg, {
      status: 200,
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=60", // shorter cache on error
        "X-Badge-Status": "error",
      },
    });
  }
}
