import { ethers } from "ethers";

// Base mainnet fork must be running at http://127.0.0.1:8545 (chainId 8453)
// This smoke test uses ONLY real Base mainnet contracts/tokens on a fork.
// No mock tokens, no sample deployments.
//
// It performs:
// - wrap ETH -> WETH
// - transfer WETH directly to the burn sink
// - assert sink balance increases

const RPC_URL = process.env.BASE_FORK_RPC || "http://127.0.0.1:8545";

// Base mainnet addresses (checked via eth_getCode on fork)
const WETH = "0x4200000000000000000000000000000000000006";
const BURN_SINK = "0x000000000000000000000000000000000000dEaD";

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address,uint256) returns (bool)",
];

const WETH_ABI = [
  ...ERC20_ABI,
  "function deposit() payable",
];

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const network = await provider.getNetwork();
  if (Number(network.chainId) !== 8453) {
    throw new Error(`Expected chainId 8453 (Base), got ${network.chainId}`);
  }

  // Provide a private key via env for fork testing.
  // IMPORTANT: do not hardcode private keys in repo.
  const pk = process.env.ANVIL_PRIVATE_KEY;
  if (!pk) {
    throw new Error("Missing ANVIL_PRIVATE_KEY (do not hardcode private keys). ");
  }
  const wallet = new ethers.Wallet(pk, provider);
  const signer = new ethers.NonceManager(wallet);

  const weth = new ethers.Contract(WETH, WETH_ABI, signer);

  // Wrap some ETH into WETH.
  const amountIn = ethers.parseEther("0.05");
  await (await weth.deposit({ value: amountIn })).wait();

  const walletAddress = await signer.getAddress();
  const beforeSink: bigint = await weth.balanceOf(BURN_SINK);

  // Direct transfer to burn sink (simple smoke test; no routers).
  await (await weth.transfer(BURN_SINK, amountIn)).wait();

  const afterSink: bigint = await weth.balanceOf(BURN_SINK);
  if (afterSink <= beforeSink) {
    throw new Error("Direct transfer test failed: sink balance did not increase");
  }

  console.log("OK: fork smoke direct transfer succeeded");
  console.log("  wallet=", walletAddress);
  console.log("  sink=", BURN_SINK);
  console.log("  delta=", (afterSink - beforeSink).toString());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
