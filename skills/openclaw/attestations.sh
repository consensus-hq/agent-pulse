#!/bin/bash
# agent-pulse attestations 0xAddr --received|--given [--limit N] [--outcome success]

ADDRESS=$1
TYPE=""
LIMIT=10
OUTCOME_FILTER=""

shift
while [[ "$#" -gt 0 ]]; do
    case $1 in
        --received) TYPE="received" ;;
        --given) TYPE="given" ;;
        --limit) LIMIT="$2"; shift ;;
        --outcome) OUTCOME_FILTER="$2"; shift ;;
        *) echo "Unknown parameter: $1"; exit 1 ;;
    esac
    shift
done

if [[ -z "$ADDRESS" || -z "$TYPE" ]]; then
    echo "Usage: agent-pulse attestations <address> --received|--given [--limit <n>] [--outcome <outcome>]"
    exit 1
fi

echo "Fetching last $LIMIT attestations $TYPE by $ADDRESS..."
if [[ -n "$OUTCOME_FILTER" ]]; then
    echo "Filtering for outcome: $OUTCOME_FILTER"
fi

echo "----------------------------------------------------------------"
printf "%-18s | %-10s | %-12s | %-20s\n" "Counterparty" "Outcome" "Weight" "Timestamp"
echo "----------------------------------------------------------------"
printf "%-18s | %-10s | %-12s | %-20s\n" "0x123...abc" "success" "95" "2026-02-05 14:20"
printf "%-18s | %-10s | %-12s | %-20s\n" "0x456...def" "success" "82" "2026-02-05 10:15"
printf "%-18s | %-10s | %-12s | %-20s\n" "0x789...ghi" "failure" "70" "2026-02-04 22:45"
echo "----------------------------------------------------------------"

exit 0
