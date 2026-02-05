#!/bin/bash

RPC_URL="http://127.0.0.1:8545"
FUNDER_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
TOKEN_ADDR="0x987c7Cb1F8C315b442E1af27Fe86F9a1906806D8"
REGISTRY_ADDR="0xe98126c33284b48C5C5a1836A3bDAcBBF7e8F12b"

# Wallet addresses
WALLETS=(
  "0x6481C463e88Ef23c4982b9587E51C693db0F1983"
  "0x27814fF5b0127f0bF44F4c806604b91cD327A363"
  "0x2BCf33e89923590ac994663df71754fE5308B234"
  "0xad01A5d5C674F5135949bDe7D6Cd9200EEe54C6a"
  "0xE4B47DCc564d64AC2cF1DF678edCEEdb22AE1b9F"
  "0x5C0068b19e3134DE08b3BCcb48847c16395E2279"
  "0x5ce8df3106C9E1ef9a95587cdBFb526cDeF2F637"
  "0xEF3548A7040f05578C148B48A1bF8295436a9319"
  "0x4a6214e55485C075dA94d1F01578267FBbdFFA59"
  "0x3C4642812ef50f89d0faf941E9f236A9D312cB96"
)

echo "{"
echo '  "funding_txs": ['

FIRST=true

for addr in "${WALLETS[@]}"; do
  if [ "$FIRST" = true ]; then
    FIRST=false
  else
    echo ","
  fi
  
  echo "Funding $addr..." >&2
  
  # Fund with 100 ETH
  ETH_TX=$(cast send --private-key "$FUNDER_KEY" --rpc-url "$RPC_URL" "$addr" --value 100ether --json | jq -r '.transactionHash')
  echo "  {\"type\": \"eth\", \"wallet\": \"$addr\", \"tx\": \"$ETH_TX\"}" >&2
  
  # Mint 100,000 PULSE tokens (100000 * 10^18)
  MINT_TX=$(cast send --private-key "$FUNDER_KEY" --rpc-url "$RPC_URL" "$TOKEN_ADDR" "mint(address,uint256)" "$addr" 100000000000000000000000 --json | jq -r '.transactionHash')
  echo "  {\"type\": \"mint\", \"wallet\": \"$addr\", \"tx\": \"$MINT_TX\"}" >&2
  
  # Approve PulseRegistry to spend PULSE tokens (max uint256)
  APPROVE_TX=$(cast send --private-key "$FUNDER_KEY" --rpc-url "$RPC_URL" "$TOKEN_ADDR" "approve(address,uint256)" "$REGISTRY_ADDR" 115792089237316195423570985008687907853269984665640564039457584007913129639935 --json | jq -r '.transactionHash')
  echo "  {\"type\": \"approve\", \"wallet\": \"$addr\", \"tx\": \"$APPROVE_TX\"}" >&2
  
  echo "    \"$ETH_TX\","
  echo "    \"$MINT_TX\","
  echo "    \"$APPROVE_TX\""
done

echo '  ]'
echo "}"
