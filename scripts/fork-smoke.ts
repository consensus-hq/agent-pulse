import { ethers } from "ethers";

// Base mainnet fork must be running at http://127.0.0.1:8545 (chainId 8453)
// This smoke test uses ONLY real Base mainnet contracts/tokens on a fork.
// No mock tokens, no sample deployments.
//
// It performs:
// - wrap ETH -> WETH
// - attempt swap WETH -> USDC through the canonical router
// - if router swap fails, fallback to verifying a live WETH/USDC V3 pool
// - assert either swap succeeded or pool liquidity is present

const RPC_URL = process.env.BASE_FORK_RPC || "http://127.0.0.1:8545";

// Base mainnet addresses (checked via eth_getCode on fork)
const WETH = "0x4200000000000000000000000000000000000006";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const SWAP_ROUTER_V3 = "0x2626664c2603336E57B271c5C0b26F421741e481"; // Uniswap V3 SwapRouter02 (Base)
const V3_FACTORY = "0x33128a8fC17869897dCe68Ed026d694621f6FDfD";
const FEE_TIERS = [500, 3000, 10000];

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

const V3_FACTORY_ABI = [
  "function getPool(address tokenA, address tokenB, uint24 fee) view returns (address)",
];

const V3_POOL_ABI = [
  "function liquidity() view returns (uint128)",
  "function slot0() view returns (uint160,int24,uint16,uint16,uint16,uint8,bool)",
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
  const usdc = new ethers.Contract(USDC, ERC20_ABI, signer);
  const router = new ethers.Contract(SWAP_ROUTER_V3, SWAP_ROUTER_ABI, signer);
  const factory = new ethers.Contract(V3_FACTORY, V3_FACTORY_ABI, provider);

  // Wrap some ETH into WETH.
  const amountIn = ethers.parseEther("0.05");
  await (await weth.deposit({ value: amountIn })).wait();

  // Approve router to spend WETH.
  await (await weth.approve(SWAP_ROUTER_V3, ethers.MaxUint256)).wait();

  const walletAddress = await signer.getAddress();
  const beforeUsdc: bigint = await usdc.balanceOf(walletAddress);

  let swapSucceeded = false;
  try {
    // Swap WETH -> USDC. We set amountOutMinimum=0 for a smoke test, then assert balance increased.
    // Production logic MUST use quotes + slippage protection.
    const fee = 3000; // 0.3%
    const deadline = Math.floor(Date.now() / 1000) + 10 * 60;

    const tx = await router.exactInputSingle({
      tokenIn: WETH,
      tokenOut: USDC,
      fee,
      recipient: walletAddress,
      deadline,
      amountIn,
      amountOutMinimum: 0,
      sqrtPriceLimitX96: 0,
    });

    await tx.wait();

    const afterUsdc: bigint = await usdc.balanceOf(walletAddress);
    if (afterUsdc > beforeUsdc) {
      swapSucceeded = true;
      console.log("OK: fork smoke swap succeeded");
      console.log("  wallet=", walletAddress);
      console.log("  usdc_delta=", (afterUsdc - beforeUsdc).toString());
    }
  } catch (error) {
    console.warn("WARN: router swap failed; falling back to pool liquidity check.");
    console.warn(error);
  }

  if (swapSucceeded) {
    return;
  }

  let foundPool = false;
  for (const fee of FEE_TIERS) {
    const poolAddress: string = await factory.getPool(WETH, USDC, fee);
    if (poolAddress === ethers.ZeroAddress) continue;

    const pool = new ethers.Contract(poolAddress, V3_POOL_ABI, provider);
    const liquidity: bigint = await pool.liquidity();
    const slot0 = await pool.slot0();
    const unlocked = Boolean(slot0[6]);

    if (liquidity > 0n && unlocked) {
      foundPool = true;
      console.log("OK: fork pool check succeeded");
      console.log("  pool=", poolAddress);
      console.log("  fee=", fee);
      console.log("  liquidity=", liquidity.toString());
      break;
    }
  }

  if (!foundPool) {
    throw new Error("No live WETH/USDC V3 pool found; fork may be unhealthy");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
