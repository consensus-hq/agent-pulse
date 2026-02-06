#!/usr/bin/env bash
# pr-preflight.sh — Pre-merge checklist for PRs
# Runs all verification gates before a PR is safe to merge.
# Exit code 0 = all gates pass. Non-zero = do NOT merge.
set -euo pipefail

# ── Args ──
PR_NUMBER="${1:?Usage: pr-preflight.sh <pr-number> [--skip-reviews]}"
SKIP_REVIEWS="${2:-}"
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo .)"
cd "$REPO_ROOT"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

pass() { echo -e "${GREEN}✅ PASS${NC}: $1"; }
fail() { echo -e "${RED}❌ FAIL${NC}: $1"; FAILURES=$((FAILURES + 1)); }
warn() { echo -e "${YELLOW}⚠️  WARN${NC}: $1"; }
FAILURES=0

echo "═══════════════════════════════════════════"
echo "  PR #${PR_NUMBER} — Pre-Merge Preflight"
echo "═══════════════════════════════════════════"
echo ""

# ── Gate 1: Not on main ──
echo "── Gate 1: Branch safety ──"
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" = "main" ]; then
  fail "Currently on main. Must be on a feature branch."
else
  pass "On branch: $CURRENT_BRANCH"
fi
echo ""

# ── Gate 2: Local build ──
echo "── Gate 2: Local build ──"
if [ -f "pnpm-workspace.yaml" ] || [ -f "pnpm-lock.yaml" ]; then
  # Detect web app package
  if [ -d "apps/web" ]; then
    echo "  Running: pnpm --filter web build"
    if pnpm --filter web build > /tmp/pr-build-log.txt 2>&1; then
      pass "pnpm --filter web build succeeded"
    else
      fail "pnpm --filter web build FAILED"
      echo "  Last 15 lines:"
      tail -15 /tmp/pr-build-log.txt | sed 's/^/    /'
    fi
  elif [ -f "package.json" ]; then
    echo "  Running: pnpm build"
    if pnpm build > /tmp/pr-build-log.txt 2>&1; then
      pass "pnpm build succeeded"
    else
      fail "pnpm build FAILED"
      tail -15 /tmp/pr-build-log.txt | sed 's/^/    /'
    fi
  fi
elif [ -f "foundry.toml" ]; then
  echo "  Running: forge build"
  if forge build > /tmp/pr-build-log.txt 2>&1; then
    pass "forge build succeeded"
  else
    fail "forge build FAILED"
    tail -10 /tmp/pr-build-log.txt | sed 's/^/    /'
  fi
else
  warn "No recognized build system found. Skipping build gate."
fi
echo ""

# ── Gate 3: TypeScript check ──
echo "── Gate 3: TypeScript ──"
if [ -f "apps/web/tsconfig.json" ]; then
  if cd apps/web && npx tsc --noEmit > /tmp/pr-tsc-log.txt 2>&1; then
    pass "tsc --noEmit clean"
  else
    fail "TypeScript errors found"
    head -20 /tmp/pr-tsc-log.txt | sed 's/^/    /'
  fi
  cd "$REPO_ROOT"
elif [ -f "tsconfig.json" ]; then
  if npx tsc --noEmit > /tmp/pr-tsc-log.txt 2>&1; then
    pass "tsc --noEmit clean"
  else
    fail "TypeScript errors found"
    head -20 /tmp/pr-tsc-log.txt | sed 's/^/    /'
  fi
else
  warn "No tsconfig.json found. Skipping TypeScript gate."
fi
echo ""

# ── Gate 4: Tests ──
echo "── Gate 4: Tests ──"
if [ -d "apps/web/src/__tests__" ] || [ -f "apps/web/vitest.config.ts" ]; then
  if cd apps/web && npx vitest run > /tmp/pr-test-log.txt 2>&1; then
    PASS_COUNT=$(grep -oP '\d+ passed' /tmp/pr-test-log.txt | head -1 || echo "? passed")
    pass "Vitest: $PASS_COUNT"
  else
    fail "Vitest tests FAILED"
    tail -10 /tmp/pr-test-log.txt | sed 's/^/    /'
  fi
  cd "$REPO_ROOT"
elif [ -f "foundry.toml" ]; then
  if forge test > /tmp/pr-test-log.txt 2>&1; then
    pass "Forge tests passed"
  else
    fail "Forge tests FAILED"
    tail -10 /tmp/pr-test-log.txt | sed 's/^/    /'
  fi
else
  warn "No test runner found. Skipping test gate."
fi
echo ""

# ── Gate 5: Vercel preview build ──
echo "── Gate 5: Vercel preview build ──"
if command -v gh &>/dev/null; then
  # Check PR deployment status via GitHub checks
  DEPLOY_STATUS=$(gh pr checks "$PR_NUMBER" 2>/dev/null | grep -i "vercel\|deploy" | head -1 || echo "")
  if [ -n "$DEPLOY_STATUS" ]; then
    if echo "$DEPLOY_STATUS" | grep -qi "pass\|success\|✓"; then
      pass "Vercel preview: $DEPLOY_STATUS"
    elif echo "$DEPLOY_STATUS" | grep -qi "fail\|error\|✗"; then
      fail "Vercel preview FAILED: $DEPLOY_STATUS"
    elif echo "$DEPLOY_STATUS" | grep -qi "pending\|running"; then
      warn "Vercel preview still building. Wait for it to finish."
    else
      warn "Vercel status unclear: $DEPLOY_STATUS"
    fi
  else
    warn "No Vercel check found on PR #$PR_NUMBER. Check manually."
  fi
else
  warn "gh CLI not available. Check Vercel preview manually."
fi
echo ""

# ── Gate 6: Auto-review comments ──
echo "── Gate 6: Auto-review comments ──"
if [ "$SKIP_REVIEWS" = "--skip-reviews" ]; then
  warn "Review check skipped (--skip-reviews flag)"
elif command -v gh &>/dev/null; then
  COMMENTS=$(gh api "repos/{owner}/{repo}/pulls/$PR_NUMBER/comments" --jq 'length' 2>/dev/null || echo "0")
  RED_COUNT=$(gh api "repos/{owner}/{repo}/pulls/$PR_NUMBER/comments" --jq '[.[] | select(.body | test("🔴"))] | length' 2>/dev/null || echo "0")
  P1_COUNT=$(gh api "repos/{owner}/{repo}/pulls/$PR_NUMBER/comments" --jq '[.[] | select(.body | test("P1"))] | length' 2>/dev/null || echo "0")

  if [ "$RED_COUNT" -gt 0 ]; then
    fail "$RED_COUNT red (🔴) issues found in review comments. Fix before merge."
  elif [ "$P1_COUNT" -gt 0 ]; then
    warn "$P1_COUNT P1 issues found. Review and decide if blocking."
  elif [ "$COMMENTS" -gt 0 ]; then
    pass "$COMMENTS review comments, no red/P1 issues"
  else
    warn "No review comments yet. Devin/Codex take 3-5 min. Wait or re-check."
  fi
else
  warn "gh CLI not available. Check review comments manually."
fi
echo ""

# ── Gate 7: Diff sanity check ──
echo "── Gate 7: Diff size ──"
if command -v gh &>/dev/null; then
  DIFF_STATS=$(gh pr view "$PR_NUMBER" --json additions,deletions,changedFiles --jq '"\(.changedFiles) files, +\(.additions) -\(.deletions)"' 2>/dev/null || echo "unknown")
  echo "  Changes: $DIFF_STATS"
  CHANGED_FILES=$(gh pr view "$PR_NUMBER" --json changedFiles --jq '.changedFiles' 2>/dev/null || echo "0")
  if [ "$CHANGED_FILES" -gt 50 ]; then
    warn "Large PR ($CHANGED_FILES files). Consider splitting."
  else
    pass "PR size reasonable ($DIFF_STATS)"
  fi
fi
echo ""

# ── Summary ──
echo "═══════════════════════════════════════════"
if [ "$FAILURES" -gt 0 ]; then
  echo -e "${RED}  ❌ $FAILURES gate(s) FAILED. DO NOT MERGE.${NC}"
  echo "═══════════════════════════════════════════"
  exit 1
else
  echo -e "${GREEN}  ✅ All gates passed. Safe to merge.${NC}"
  echo "═══════════════════════════════════════════"
  exit 0
fi
