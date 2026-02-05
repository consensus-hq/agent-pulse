#!/usr/bin/env node
/**
 * Compliance scanner for Agent Pulse.
 * Scans source files for forbidden framing language per IDENTITY.md rules.
 * Exit 0 = clean, Exit 1 = violations found.
 */

const fs = require("fs");
const path = require("path");

// Forbidden terms (case-insensitive regex patterns)
// Note: "burn" alone is allowed (burn sink is our core mechanism).
// Only flag DeFi-financial "burn" in buyback/token-burn contexts.
const FORBIDDEN = [
  { pattern: /\b(invest(ment|ing|or)?)\b/i, label: "investment language" },
  { pattern: /\bROI\b/i, label: "ROI" },
  { pattern: /\b(trading|trade)\b(?!\s*(framing|language))/i, label: "trading language" },
  { pattern: /\b(buy|sell)\b(?!\s*(compute|list))/i, label: "buy/sell" },
  { pattern: /\bprice\b(?!\s*(feeds?|oracle|manipulation))/i, label: "price" },
  { pattern: /\bmarket\s*cap\b/i, label: "market cap" },
  { pattern: /\b(yield|dividend|staking|buyback)\b/i, label: "DeFi financial" },
  { pattern: /\btoken\s+burn\b/i, label: "token burn (use 'signal sink' or 'consumed')" },
  { pattern: /\bprofit\s*(sharing)?\b/i, label: "profit" },
  { pattern: /\bearly\s*access\b/i, label: "early access" },
  { pattern: /\bverified\b(?!\s*(on|address|param))/i, label: "verified (use 'eligible' or 'active')" },
  { pattern: /\breputation\s*(as|means?|proves?|indicates?)\s*quality\b/i, label: "reputation as quality" },
];

// Allowed contexts (skip these patterns in comments/docs about compliance)
const ALLOWED_CONTEXTS = [
  /compliance/i,
  /forbidden/i,
  /disallowed/i,
  /must\s*not/i,
  /never\s*use/i,
  /no\s+(investment|trading|price|buy|sell)/i,
];

// File extensions to scan
const SCAN_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".md", ".json"];

// Directories to skip
const SKIP_DIRS = ["node_modules", ".git", ".next", "dist", "out", "lib", "coverage", "REPORTS", "queue"];

// Files to skip (compliance docs, audit reports, specs)
const SKIP_FILES = [
  "compliance-check.js",
  "IDENTITY.md",
  "HACKATHON_TASKS.md",
  "DESIGN_REFERENCE.md",
  "CONTRACT_SPEC.md",
  "SUBMISSION_PAYLOAD.md",
  "SECURITY_REVIEW_PROMPT.md",
  "PENTEST_PLAN.md",
  "CLANKER_UNISWAP_V4_NOTES.md",
  "CLAWDKITCHEN_HACKATHON.md",
  "PULSE_METADATA.json",
  "skills.md",
];

function walkDir(dir, callback) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.includes(entry.name)) {
        walkDir(fullPath, callback);
      }
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name);
      if (SCAN_EXTENSIONS.includes(ext) && !SKIP_FILES.includes(entry.name)) {
        callback(fullPath);
      }
    }
  }
}

function isAllowedContext(line) {
  return ALLOWED_CONTEXTS.some((ctx) => ctx.test(line));
}

function scanFile(filePath) {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  const violations = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isAllowedContext(line)) continue;

    for (const { pattern, label } of FORBIDDEN) {
      if (pattern.test(line)) {
        violations.push({
          file: filePath,
          line: i + 1,
          text: line.trim().substring(0, 120),
          label,
        });
      }
    }
  }

  return violations;
}

// Main
const rootDir = path.resolve(__dirname, "..");
const allViolations = [];

console.log("🔍 Agent Pulse Compliance Scanner");
console.log(`   Root: ${rootDir}`);
console.log("");

walkDir(rootDir, (filePath) => {
  const violations = scanFile(filePath);
  allViolations.push(...violations);
});

if (allViolations.length === 0) {
  console.log("✅ No compliance violations found.");
  process.exit(0);
} else {
  console.log(`⚠️  Found ${allViolations.length} potential violation(s):\n`);
  for (const v of allViolations) {
    const relPath = path.relative(rootDir, v.file);
    console.log(`  ${relPath}:${v.line} [${v.label}]`);
    console.log(`    ${v.text}`);
    console.log("");
  }
  console.log("Review each violation. Some may be false positives in allowed contexts.");
  process.exit(1);
}
