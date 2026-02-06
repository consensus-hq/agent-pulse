#!/bin/bash
# x402 Payment Flow Regression Test Script
# This script verifies that POST /api/pulse returns 402 Payment Required
# with a valid x402 payment-required header

API_URL="https://agent-pulse-nine.vercel.app/api/pulse"
FAILED=0
PASS=0

# Colors for output (disable if not TTY)
if [ -t 1 ]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    NC='\033[0m'
else
    RED=''
    GREEN=''
    YELLOW=''
    NC=''
fi

echo "========================================"
echo "x402 Payment Flow Regression Tests"
echo "Target: $API_URL"
echo "========================================"
echo ""

# Test helper function
run_test() {
    local test_num=$1
    local test_name=$2
    shift 2
    local curl_args=("$@")

    echo -n "Test $test_num: $test_name ... "

    # Capture response headers and body
    local response
    response=$(curl -s -D - "${curl_args[@]}" 2>&1)
    local http_status
    http_status=$(echo "$response" | grep -E '^HTTP/[0-9.]+' | tail -1 | awk '{print $2}')

    if [ "$http_status" = "402" ]; then
        # Check for payment-required header
        if echo "$response" | grep -qi "payment-required:"; then
            echo -e "${GREEN}PASS${NC} (HTTP $http_status)"
            ((PASS++))
            return 0
        else
            echo -e "${RED}FAIL${NC} (HTTP $http_status but missing payment-required header)"
            ((FAILED++))
            return 1
        fi
    else
        echo -e "${RED}FAIL${NC} (Expected 402, got HTTP $http_status)"
        ((FAILED++))
        return 1
    fi
}

# Test 1: Empty JSON body
run_test 1 "Empty JSON body" -X POST "$API_URL" -H "Content-Type: application/json" -d '{}'

# Test 2: No Content-Type header, no body
run_test 2 "No Content-Type, no body" -X POST "$API_URL"

# Test 3: Malformed JSON
run_test 3 "Malformed JSON" -X POST "$API_URL" -H "Content-Type: application/json" -d '{bad'

# Test 4: Valid JSON with action
run_test 4 "Valid JSON with action" -X POST "$API_URL" -H "Content-Type: application/json" -d '{"action":"pulse","target":"test"}'

# Test 5: Invalid X-Payment header
run_test 5 "Invalid X-Payment header" -X POST "$API_URL" -H "Content-Type: application/json" -H "X-Payment: garbage" -d '{"action":"pulse"}'

echo ""
echo "========================================"
echo "Results: $PASS passed, $FAILED failed"
echo "========================================"

if [ $FAILED -gt 0 ]; then
    echo -e "${RED}REGRESSION DETECTED${NC}"
    exit 1
else
    echo -e "${GREEN}x402 VERIFICATION PASSED${NC}"
    exit 0
fi
