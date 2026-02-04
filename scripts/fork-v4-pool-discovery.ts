import { ethers } from "ethers";

// Discover Uniswap v4 pools for PULSE on a Base mainnet fork and validate swap quoting.
// Usage:
//   BASE_FORK_RPC=http://127.0.0.1:8545 PULSE_TOKEN_ADDRESS=0x... \
//     npx -y tsx scripts/fork-v4-pool-discovery.ts
//
// Optional env:
//   TOKEN_IN=<addr>                  TOKEN_OUT=<addr> (default PULSE)
//   WETH_ADDRESS=<addr>              USDC_ADDRESS=<addr>
//   SCAN_BLOCK_SPAN=400000           MAX_BLOCK_RANGE=50000
//   EXACT_IN=1000000000000000
//   V4_POOL_MANAGER=<addr>           V4_STATE_VIEW=<addr>   V4_QUOTER=<addr>
//   HOOK_DATA=0x

const RPC_URL = process.env.BASE_FORK_RPC || "http://127.0.0.1:8545";

const PULSE_TOKEN = (process.env.PULSE_TOKEN_ADDRESS || "").trim();
if (!PULSE_TOKEN) throw new Error("Missing PULSE_TOKEN_ADDRESS (source: LINKS.md)");

const WETH = (process.env.WETH_ADDRESS || "").trim();
const USDC = (process.env.USDC_ADDRESS || "").trim();

// Uniswap v4 Base deployments (from https://docs.uniswap.org/contracts/v4/deployments)
const V4_POOL_MANAGER = process.env.V4_POOL_MANAGER || "0x498581ff718922c3f8e6a244956af099b2652b2b";
const V4_STATE_VIEW = process.env.V4_STATE_VIEW || "0xa3c0c9b65bad0b08107aa264b0f3db444b867a71";
const V4_QUOTER = process.env.V4_QUOTER || "0x0d5e0f971ed27fbff6c2837bf31316121532048d";

const TOKEN_IN = (process.env.TOKEN_IN || WETH).trim();
if (!TOKEN_IN) {
  throw new Error("Missing TOKEN_IN (or WETH_ADDRESS). Provide the token-in address explicitly.");
}
const TOKEN_OUT = (process.env.TOKEN_OUT || PULSE_TOKEN).trim();
const HOOK_DATA = (process.env.HOOK_DATA || "0x").trim();

const SCAN_BLOCK_SPAN = Number(process.env.SCAN_BLOCK_SPAN || 400_000);
const MAX_BLOCK_RANGE = Number(process.env.MAX_BLOCK_RANGE || 50_000);

const POOL_MANAGER_ABI = [
  "event Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, uint24 fee, int24 tickSpacing, address hooks, uint160 sqrtPriceX96, int24 tick)",
];

const STATE_VIEW_ABI = [
  "function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)",
  "function getLiquidity(bytes32 poolId) view returns (uint128 liquidity)",
];

const QUOTER_ABI = [
  {
    type: "function",
    name: "quoteExactInputSingle",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          {
            name: "poolKey",
            type: "tuple",
            components: [
              { name: "currency0", type: "address" },
              { name: "currency1", type: "address" },
              { name: "fee", type: "uint24" },
              { name: "tickSpacing", type: "int24" },
              { name: "hooks", type: "address" },
            ],
          },
          { name: "zeroForOne", type: "bool" },
          { name: "exactAmount", type: "uint128" },
          { name: "hookData", type: "bytes" },
        ],
      },
    ],
    outputs: [
      { name: "amountOut", type: "uint256" },
      { name: "gasEstimate", type: "uint256" },
    ],
  },
];

function norm(addr: string): string {
  return ethers.getAddress(addr);
}

function label(addr: string): string {
  const normalized = norm(addr);
  if (normalized.toLowerCase() === norm(PULSE_TOKEN).toLowerCase()) return "PULSE";
  if (WETH && normalized.toLowerCase() === norm(WETH).toLowerCase()) return "WETH";
  if (USDC && normalized.toLowerCase() === norm(USDC).toLowerCase()) return "USDC";
  return normalized;
}

function toTopic(addr: string): string {
  return ethers.zeroPadValue(norm(addr), 32);
}

function defaultExactIn(tokenIn: string): bigint {
  const n = norm(tokenIn);
  if (USDC && n.toLowerCase() === norm(USDC).toLowerCase()) {
    return 1_000_000n; // 1 USDC (6 decimals)
  }
  return 1_000_000_000_000_000n; // 0.001 token (18 decimals default)
}

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const net = await provider.getNetwork();
  if (Number(net.chainId) !== 8453) {
    throw new Error(`Expected Base chainId 8453, got ${net.chainId.toString()}`);
  }

  console.log(`RPC: ${RPC_URL}`);
  console.log(`PoolManager: ${V4_POOL_MANAGER}`);
  console.log(`StateView: ${V4_STATE_VIEW}`);
  console.log(`Quoter: ${V4_QUOTER}`);
  console.log(`Token in: ${label(TOKEN_IN)}`);
  console.log(`Token out: ${label(TOKEN_OUT)}`);

  const latest = await provider.getBlockNumber();
  const fromBlock = Math.max(0, latest - SCAN_BLOCK_SPAN);

  const iface = new ethers.Interface(POOL_MANAGER_ABI);
  const initTopic = iface.getEvent("Initialize").topicHash;

  const baseParams = {
    address: norm(V4_POOL_MANAGER),
  };

  const logs: Array<ethers.Log> = [];
  console.log(`Scanning blocks ${fromBlock} -> ${latest} (max range ${MAX_BLOCK_RANGE})`);

  for (let start = fromBlock; start <= latest; start += MAX_BLOCK_RANGE + 1) {
    const end = Math.min(latest, start + MAX_BLOCK_RANGE);
    const rangeParams = { ...baseParams, fromBlock: start, toBlock: end };

    const batch = await provider.getLogs({
      ...rangeParams,
      topics: [initTopic, null, toTopic(PULSE_TOKEN)],
    });
    const batch2 = await provider.getLogs({
      ...rangeParams,
      topics: [initTopic, null, null, toTopic(PULSE_TOKEN)],
    });

    logs.push(...batch, ...batch2);
  }

  console.log(`Initialize logs (currency0/1 == PULSE): ${logs.length}`);

  if (!logs.length) {
    console.log("No matching v4 pool initializations found. Try increasing SCAN_BLOCK_SPAN.");
    return;
  }

  const stateView = new ethers.Contract(norm(V4_STATE_VIEW), STATE_VIEW_ABI, provider);
  const quoter = new ethers.Contract(norm(V4_QUOTER), QUOTER_ABI, provider);
  const abiCoder = ethers.AbiCoder.defaultAbiCoder();

  async function safeGetCode(labelName: string, address: string): Promise<string | null> {
    try {
      const code = await provider.getCode(address);
      console.log(`${labelName} code: ${code === "0x" ? "missing" : "ok"}`);
      return code;
    } catch (e: any) {
      console.log(`${labelName} code check failed: ${String(e?.shortMessage || e?.message || e)}`);
      return null;
    }
  }

  await safeGetCode("PoolManager", norm(V4_POOL_MANAGER));
  await safeGetCode("StateView", norm(V4_STATE_VIEW));
  await safeGetCode("Quoter", norm(V4_QUOTER));

  const pools = new Map<string, {
    poolId: string;
    currency0: string;
    currency1: string;
    fee: bigint;
    tickSpacing: number;
    hooks: string;
    blockNumber: number;
  }>();

  for (const log of logs) {
    const parsed = iface.parseLog(log);
    const poolId = parsed.args.id as string;
    const currency0 = norm(parsed.args.currency0 as string);
    const currency1 = norm(parsed.args.currency1 as string);
    const fee = parsed.args.fee as bigint;
    const tickSpacing = Number(parsed.args.tickSpacing);
    const hooks = norm(parsed.args.hooks as string);

    if (!pools.has(poolId)) {
      pools.set(poolId, {
        poolId,
        currency0,
        currency1,
        fee,
        tickSpacing,
        hooks,
        blockNumber: log.blockNumber ?? 0,
      });
    }
  }

  console.log(`Pools discovered: ${pools.size}`);

  for (const pool of pools.values()) {
    console.log("\n== Pool ==");
    console.log(`poolId: ${pool.poolId}`);
    console.log(`currency0: ${label(pool.currency0)}`);
    console.log(`currency1: ${label(pool.currency1)}`);
    console.log(`fee: ${pool.fee.toString()}`);
    console.log(`tickSpacing: ${pool.tickSpacing}`);
    console.log(`hooks: ${pool.hooks}`);
    console.log(`initBlock: ${pool.blockNumber}`);

    const computedId = ethers.keccak256(
      abiCoder.encode(
        ["address", "address", "uint24", "int24", "address"],
        [pool.currency0, pool.currency1, pool.fee, pool.tickSpacing, pool.hooks]
      )
    );

    if (computedId.toLowerCase() !== pool.poolId.toLowerCase()) {
      console.log(`warning: computed poolId mismatch: ${computedId}`);
    }

    try {
      const slot0 = await stateView.getSlot0(pool.poolId);
      const liquidity = await stateView.getLiquidity(pool.poolId);
      console.log(`slot0: sqrtPriceX96=${slot0[0].toString()} tick=${slot0[1].toString()} lpFee=${slot0[3].toString()}`);
      console.log(`liquidity: ${liquidity.toString()}`);
    } catch (e: any) {
      console.log(`stateView read failed: ${String(e?.shortMessage || e?.message || e)}`);
    }

    const tokenIn = norm(TOKEN_IN);
    const tokenOut = norm(TOKEN_OUT);

    const zeroForOne = tokenIn.toLowerCase() === pool.currency0.toLowerCase();
    const matches =
      (zeroForOne && tokenOut.toLowerCase() === pool.currency1.toLowerCase()) ||
      (!zeroForOne && tokenOut.toLowerCase() === pool.currency0.toLowerCase());

    if (!matches) {
      console.log("quoteExactInputSingle skipped (tokenIn/tokenOut do not match pool)");
      continue;
    }

    const exactIn = BigInt(process.env.EXACT_IN || defaultExactIn(tokenIn));

    try {
      const quote = await quoter.quoteExactInputSingle.staticCall({
        poolKey: {
          currency0: pool.currency0,
          currency1: pool.currency1,
          fee: pool.fee,
          tickSpacing: pool.tickSpacing,
          hooks: pool.hooks,
        },
        zeroForOne,
        exactAmount: exactIn,
        hookData: HOOK_DATA,
      });

      const amountOut = quote[0];
      const gasEstimate = quote[1];

      console.log(
        `quoteExactInputSingle: in=${exactIn.toString()} out=${amountOut.toString()} gas=${gasEstimate.toString()}`
      );
    } catch (e: any) {
      console.log(`quoteExactInputSingle failed: ${String(e?.shortMessage || e?.message || e)}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
