#!/usr/bin/env bash
# ============================================================================
# Agent Pulse — 1-Click Onboarding
# On-chain liveness protocol for AI agents on Base
#
# Usage:
#   ./quickstart.sh 0xYourAgentAddress
#   curl -sS https://agent-pulse-nine.vercel.app/quickstart | bash -s -- 0xYourAgent
# ============================================================================
set -euo pipefail

# ── Colors & Styles ─────────────────────────────────────────────────────────
if [ -t 1 ] || [ "${FORCE_COLOR:-0}" = "1" ]; then
  BOLD="\033[1m"
  DIM="\033[2m"
  RESET="\033[0m"
  RED="\033[1;31m"
  GREEN="\033[1;32m"
  YELLOW="\033[1;33m"
  BLUE="\033[1;34m"
  MAGENTA="\033[1;35m"
  CYAN="\033[1;36m"
  WHITE="\033[1;37m"
  BG_GREEN="\033[42m"
  BG_RED="\033[41m"
  CHECK="✔"
  CROSS="✘"
  ARROW="→"
  PULSE_DOT="●"
  SPARKLE="✦"
else
  BOLD="" DIM="" RESET=""
  RED="" GREEN="" YELLOW="" BLUE="" MAGENTA="" CYAN="" WHITE=""
  BG_GREEN="" BG_RED=""
  CHECK="[OK]" CROSS="[FAIL]" ARROW="->" PULSE_DOT="*" SPARKLE="*"
fi

# ── API Base URL ────────────────────────────────────────────────────────────
API_BASE="https://agent-pulse-nine.vercel.app"

# ── Helper Functions ────────────────────────────────────────────────────────
info()    { printf "  ${BLUE}${PULSE_DOT}${RESET} %b\n" "$1"; }
success() { printf "  ${GREEN}${CHECK}${RESET} %b\n" "$1"; }
warn()    { printf "  ${YELLOW}!${RESET} %b\n" "$1"; }
fail()    { printf "  ${RED}${CROSS}${RESET} %b\n" "$1"; }
step()    { printf "\n${BOLD}${CYAN}[$1/5]${RESET} ${BOLD}%b${RESET}\n" "$2"; }
divider() { printf "${DIM}  ─────────────────────────────────────────────────${RESET}\n"; }

spinner() {
  local pid=$1
  local frames=("⠋" "⠙" "⠹" "⠸" "⠼" "⠴" "⠦" "⠧" "⠇" "⠏")
  local i=0
  while kill -0 "$pid" 2>/dev/null; do
    printf "\r  ${CYAN}${frames[$i]}${RESET} %b " "$2"
    i=$(( (i + 1) % ${#frames[@]} ))
    sleep 0.1
  done
  printf "\r"
}

banner() {
  printf "\n"
  printf "${MAGENTA}"
  cat << 'LOGO'
       █████╗  ██████╗ ███████╗███╗   ██╗████████╗
      ██╔══██╗██╔════╝ ██╔════╝████╗  ██║╚══██╔══╝
      ███████║██║  ███╗█████╗  ██╔██╗ ██║   ██║
      ██╔══██║██║   ██║██╔══╝  ██║╚██╗██║   ██║
      ██║  ██║╚██████╔╝███████╗██║ ╚████║   ██║
      ╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝  ╚═══╝   ╚═╝
LOGO
  printf "${RESET}"
  printf "${CYAN}${BOLD}"
  cat << 'LOGO2'
      ██████╗ ██╗   ██╗██╗     ███████╗███████╗
      ██╔══██╗██║   ██║██║     ██╔════╝██╔════╝
      ██████╔╝██║   ██║██║     ███████╗█████╗
      ██╔═══╝ ██║   ██║██║     ╚════██║██╔══╝
      ██║     ╚██████╔╝███████╗███████║███████╗
      ╚═╝      ╚═════╝ ╚══════╝╚══════╝╚══════╝
LOGO2
  printf "${RESET}"
  printf "\n"
  printf "  ${DIM}On-chain liveness protocol for AI agents on Base${RESET}\n"
  printf "  ${DIM}${SPARKLE} Prove your agent is alive. Every heartbeat counts.${RESET}\n"
  divider
}

# ── Validate Ethereum Address ───────────────────────────────────────────────
validate_address() {
  local addr="$1"
  if [[ ! "$addr" =~ ^0x[0-9a-fA-F]{40}$ ]]; then
    fail "Invalid Ethereum address: ${WHITE}${addr}${RESET}"
    printf "\n  Expected format: ${DIM}0x followed by 40 hex characters${RESET}\n"
    printf "  Example: ${DIM}0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18${RESET}\n\n"
    exit 1
  fi
}

# ── Extract JSON field (portable, no jq dependency) ────────────────────────
json_val() {
  # Usage: json_val "$json" "fieldName"
  # Handles strings, numbers, booleans, and null
  local json="$1" key="$2"
  # Try to extract a string value first
  local val
  val=$(printf '%s' "$json" | sed -n 's/.*"'"$key"'"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)
  if [ -n "$val" ]; then
    printf '%s' "$val"
    return
  fi
  # Try number/boolean/null
  val=$(printf '%s' "$json" | sed -n 's/.*"'"$key"'"[[:space:]]*:[[:space:]]*\([^,}"[:space:]]*\).*/\1/p' | head -1)
  printf '%s' "$val"
}

# ── Dependency Check ────────────────────────────────────────────────────────
check_deps() {
  local missing=0
  for cmd in curl sed; do
    if ! command -v "$cmd" &>/dev/null; then
      fail "Required command not found: ${WHITE}${cmd}${RESET}"
      missing=1
    fi
  done
  if [ "$missing" -eq 1 ]; then
    printf "\n  Please install the missing dependencies and try again.\n\n"
    exit 1
  fi
}

# ============================================================================
# MAIN
# ============================================================================

banner

# ── Get Address ─────────────────────────────────────────────────────────────
ADDRESS="${1:-}"

if [ -z "$ADDRESS" ]; then
  printf "  ${YELLOW}${ARROW}${RESET} Enter your agent's wallet address: "
  read -r ADDRESS
  printf "\n"
fi

if [ -z "$ADDRESS" ]; then
  fail "No address provided."
  printf "\n  ${DIM}Usage: ./quickstart.sh 0xYourAgentAddress${RESET}\n\n"
  exit 1
fi

validate_address "$ADDRESS"
check_deps

printf "\n  ${WHITE}Agent:${RESET} ${CYAN}${ADDRESS}${RESET}\n"
divider

# ── Step 1: Check Current Status ───────────────────────────────────────────
step "1" "Checking agent status..."

STATUS_RESP=$(curl -sS --max-time 15 "${API_BASE}/api/status/${ADDRESS}" 2>&1) || {
  fail "Failed to reach Agent Pulse API"
  printf "  ${DIM}Is ${API_BASE} accessible?${RESET}\n"
  exit 1
}

# Check for error
STATUS_ERR=$(json_val "$STATUS_RESP" "error")
AGENT_REGISTERED=$(json_val "$STATUS_RESP" "registered")
PULSE_BALANCE_BEFORE=$(json_val "$STATUS_RESP" "pulseBalance")
STREAK=$(json_val "$STATUS_RESP" "streak")
LAST_PULSE=$(json_val "$STATUS_RESP" "lastPulse")
IS_ALIVE=$(json_val "$STATUS_RESP" "isAlive")

if [ -n "$STATUS_ERR" ] && [ "$STATUS_ERR" != "null" ]; then
  warn "API returned: ${DIM}${STATUS_ERR}${RESET}"
  AGENT_REGISTERED="false"
  PULSE_BALANCE_BEFORE="0"
fi

if [ "$AGENT_REGISTERED" = "true" ]; then
  success "Agent is already registered!"
  info "Balance: ${WHITE}${PULSE_BALANCE_BEFORE:-0} PULSE${RESET}"
  info "Streak:  ${WHITE}${STREAK:-0}${RESET}"
  if [ "$IS_ALIVE" = "true" ]; then
    info "Status:  ${GREEN}ALIVE ${PULSE_DOT}${RESET}"
  else
    info "Status:  ${YELLOW}DORMANT${RESET}"
  fi
  if [ -n "$LAST_PULSE" ] && [ "$LAST_PULSE" != "null" ] && [ "$LAST_PULSE" != "0" ]; then
    info "Last pulse: ${DIM}${LAST_PULSE}${RESET}"
  fi
else
  info "Agent not yet registered — ${DIM}we'll get you set up!${RESET}"
  PULSE_BALANCE_BEFORE="0"
fi

# ── Step 2: Claim from Faucet ──────────────────────────────────────────────
step "2" "Claiming 10,000 PULSE from faucet..."

FAUCET_RESP=$(curl -sS --max-time 30 -X POST \
  "${API_BASE}/api/faucet" \
  -H "Content-Type: application/json" \
  -d "{\"address\": \"${ADDRESS}\"}" 2>&1) || {
  fail "Faucet request failed — network error"
  exit 1
}

FAUCET_ERR=$(json_val "$FAUCET_RESP" "error")
FAUCET_SUCCESS=$(json_val "$FAUCET_RESP" "success")
FAUCET_TX=$(json_val "$FAUCET_RESP" "txHash")
FAUCET_MSG=$(json_val "$FAUCET_RESP" "message")
FAUCET_BALANCE=$(json_val "$FAUCET_RESP" "balance")

if [ "$FAUCET_SUCCESS" = "true" ]; then
  success "Faucet claim successful! ${SPARKLE}"
  if [ -n "$FAUCET_TX" ] && [ "$FAUCET_TX" != "null" ]; then
    info "Tx: ${DIM}https://basescan.org/tx/${FAUCET_TX}${RESET}"
  fi
  if [ -n "$FAUCET_MSG" ] && [ "$FAUCET_MSG" != "null" ]; then
    info "${DIM}${FAUCET_MSG}${RESET}"
  fi
elif [ -n "$FAUCET_ERR" ] && [ "$FAUCET_ERR" != "null" ]; then
  warn "Faucet: ${DIM}${FAUCET_ERR}${RESET}"
  if [ -n "$FAUCET_MSG" ] && [ "$FAUCET_MSG" != "null" ]; then
    info "${DIM}${FAUCET_MSG}${RESET}"
  fi
else
  warn "Unexpected faucet response"
  info "${DIM}${FAUCET_RESP}${RESET}"
fi

# ── Step 3: Verify Updated Status ──────────────────────────────────────────
step "3" "Verifying updated status..."

# Brief pause to let on-chain state propagate
sleep 2

STATUS_RESP2=$(curl -sS --max-time 15 "${API_BASE}/api/status/${ADDRESS}" 2>&1) || {
  warn "Could not re-check status"
}

PULSE_BALANCE_AFTER=$(json_val "$STATUS_RESP2" "pulseBalance")
STREAK_AFTER=$(json_val "$STATUS_RESP2" "streak")
IS_ALIVE_AFTER=$(json_val "$STATUS_RESP2" "isAlive")
REGISTERED_AFTER=$(json_val "$STATUS_RESP2" "registered")

if [ -n "$PULSE_BALANCE_AFTER" ] && [ "$PULSE_BALANCE_AFTER" != "null" ]; then
  success "Status confirmed"
  printf "\n"
  printf "  ${DIM}┌──────────────────────────────────────┐${RESET}\n"
  printf "  ${DIM}│${RESET}  ${WHITE}${BOLD}Agent Dashboard${RESET}                    ${DIM}│${RESET}\n"
  printf "  ${DIM}├──────────────────────────────────────┤${RESET}\n"
  printf "  ${DIM}│${RESET}  Balance (before): ${YELLOW}%-16s${RESET} ${DIM}│${RESET}\n" "${PULSE_BALANCE_BEFORE:-0} PULSE"
  printf "  ${DIM}│${RESET}  Balance (after):  ${GREEN}%-16s${RESET} ${DIM}│${RESET}\n" "${PULSE_BALANCE_AFTER} PULSE"
  printf "  ${DIM}│${RESET}  Streak:           ${WHITE}%-16s${RESET} ${DIM}│${RESET}\n" "${STREAK_AFTER:-0}"
  if [ "$IS_ALIVE_AFTER" = "true" ]; then
    printf "  ${DIM}│${RESET}  Status:           ${GREEN}%-16s${RESET} ${DIM}│${RESET}\n" "● ALIVE"
  else
    printf "  ${DIM}│${RESET}  Status:           ${YELLOW}%-16s${RESET} ${DIM}│${RESET}\n" "○ DORMANT"
  fi
  printf "  ${DIM}└──────────────────────────────────────┘${RESET}\n"
else
  warn "Could not verify — balance may still be updating on-chain"
fi

# ── Step 4: Send First Pulse (optional guidance) ───────────────────────────
step "4" "How to send your first pulse"

printf "\n"
printf "  ${DIM}Your agent should call the pulse endpoint periodically:${RESET}\n\n"
printf "  ${CYAN}curl -X POST ${API_BASE}/api/pulse \\${RESET}\n"
printf "  ${CYAN}  -H \"Content-Type: application/json\" \\${RESET}\n"
printf "  ${CYAN}  -d '{\"address\": \"${ADDRESS}\"}'${RESET}\n"
printf "\n"
printf "  ${DIM}Recommended: pulse every 1-24 hours to maintain your streak.${RESET}\n"

# ── Step 5: Next Steps ─────────────────────────────────────────────────────
step "5" "Next steps"

printf "\n"
printf "  ${GREEN}${SPARKLE} ${BOLD}You're all set!${RESET} Here's what to do next:\n"
printf "\n"
printf "  ${WHITE}${BOLD}Install the SDK${RESET}\n"
printf "  ${DIM}npm install agent-pulse-sdk${RESET}\n"
printf "\n"
printf "  ${WHITE}${BOLD}Quick SDK Usage${RESET}\n"
printf "  ${DIM}import { AgentPulse } from 'agent-pulse-sdk';${RESET}\n"
printf "  ${DIM}const pulse = new AgentPulse({ address: '${ADDRESS}' });${RESET}\n"
printf "  ${DIM}await pulse.sendPulse();${RESET}\n"
printf "\n"
printf "  ${WHITE}${BOLD}Useful Links${RESET}\n"
printf "  ${ARROW} Dashboard:  ${CYAN}${API_BASE}${RESET}\n"
printf "  ${ARROW} API Docs:   ${CYAN}${API_BASE}/docs${RESET}\n"
printf "  ${ARROW} Status API: ${CYAN}${API_BASE}/api/status/${ADDRESS}${RESET}\n"
printf "  ${ARROW} GitHub:     ${CYAN}https://github.com/pulsepayxyz/agent-pulse${RESET}\n"
printf "\n"

divider
printf "\n"
printf "  ${MAGENTA}${BOLD}${PULSE_DOT} Agent Pulse${RESET} ${DIM}— Prove your agent is alive.${RESET}\n"
printf "  ${DIM}Every heartbeat counts. Keep pulsing.${RESET} ${RED}♥${RESET}\n"
printf "\n"
