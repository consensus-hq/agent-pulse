import { ethers } from "ethers";

// Base mainnet fork must be running at http://127.0.0.1:8545 (chainId 8453)
// This smoke test uses ONLY real Base mainnet contracts/tokens on a fork.
// No mock tokens, no sample deployments.
//
// It performs:
// - wrap ETH -> WETH
// - swap WETH -> USDC through the canonical router
// - asserts USDC balance increases

const RPC_URL = process.env.BASE_FORK_RPC || "http://127.0.0.1:8545";

// Base mainnet addresses (checked via eth_getCode on fork)
const WETH = "0x4200000000000000000000000000000000000006";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const SWAP_ROUTER_V3 = "0x2626664c2603336E57B271c5C0b26F421741e481"; // Uniswap V3 SwapRouter02 (Base)

const ERC20_ABI = [
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
];

const WETH_ABI = [
  ...ERC20_ABI,
  "function deposit() payable",
];

const SWAP_ROUTER_ABI = [
  "function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 deadline,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) payable returns (uint256 amountOut)",
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

  const weth = new ethers.Contract(WETH, WETH_ABI, wallet);
  const usdc = new ethers.Contract(USDC, ERC20_ABI, wallet);
  const router = new ethers.Contract(SWAP_ROUTER_V3, SWAP_ROUTER_ABI, wallet);

  // Wrap some ETH into WETH.
  const amountIn = ethers.parseEther("0.05");
  await (await weth.deposit({ value: amountIn })).wait();

  // Approve router to spend WETH.
  await (await weth.approve(SWAP_ROUTER_V3, ethers.MaxUint256)).wait();

  const beforeUsdc: bigint = await usdc.balanceOf(wallet.address);

  // Swap WETH -> USDC. We set amountOutMinimum=0 for a smoke test, then assert balance increased.
  // Production logic MUST use quotes + slippage protection.
  const fee = 3000; // 0.3%
  const deadline = Math.floor(Date.now() / 1000) + 10 * 60;

  const tx = await router.exactInputSingle({
    tokenIn: WETH,
    tokenOut: USDC,
    fee,
    recipient: wallet.address,
    deadline,
    amountIn,
    amountOutMinimum: 0,
    sqrtPriceLimitX96: 0,
  });

  await tx.wait();

  const afterUsdc: bigint = await usdc.balanceOf(wallet.address);

  if (afterUsdc <= beforeUsdc) {
    throw new Error("USDC balance did not increase; swap failed or routed to zero output");
  }

  console.log("OK: fork smoke swap succeeded");
  console.log("  wallet=", wallet.address);
  console.log("  usdc_delta=", (afterUsdc - beforeUsdc).toString());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
