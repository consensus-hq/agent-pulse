import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  toHex,
  parseAbiItem,
  encodeAbiParameters,
  keccak256,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { Clanker } from "clanker-sdk/v4";
import { FEE_CONFIGS, POOL_POSITIONS } from "clanker-sdk";

const RPC_URL = process.env.PULSE_FORK_RPC_URL;
if (!RPC_URL) {
  throw new Error("Missing PULSE_FORK_RPC_URL (Tenderly VNet RPC)");
}

const LINKS_PATH = process.env.LINKS_PATH || resolve("LINKS.md");
const METADATA_PATH =
  process.env.PULSE_METADATA_PATH || resolve("docs", "PULSE_METADATA.json");

const linksText = readFileSync(LINKS_PATH, "utf8");
const safeMatch = linksText.match(/Safe \(Treasury\):\s*(0x[a-fA-F0-9]{40})/);
if (!safeMatch) {
  throw new Error("Treasury Safe not found in LINKS.md");
}
const treasurySafe = safeMatch[1] as `0x${string}`;

const signalMatch = linksText.match(
  /Signal sink \(burn\):\s*(0x[a-fA-F0-9]{40})/
);
if (!signalMatch) {
  throw new Error("Signal sink not found in LINKS.md");
}
const signalAddress = signalMatch[1] as `0x${string}`;

const metadata = JSON.parse(readFileSync(METADATA_PATH, "utf8"));

const publicClient = createPublicClient({
  chain: base,
  transport: http(RPC_URL),
});

function resolvePrivateKey(): `0x${string}` {
  if (process.env.FORK_PRIVATE_KEY) {
    return process.env.FORK_PRIVATE_KEY as `0x${string}`;
  }
  const keyPath =
    process.env.FORK_PRIVATE_KEY_PATH ||
    "/opt/fundbot/work/workspace-connie/secrets/wallets/connie.core-mainnet.key.json";
  const data = JSON.parse(readFileSync(keyPath, "utf8"));
  if (!data?.privateKey) {
    throw new Error(
      "Private key missing. Set FORK_PRIVATE_KEY or FORK_PRIVATE_KEY_PATH."
    );
  }
  const rawKey = data.privateKey as string;
  const normalized = rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`;
  return normalized as `0x${string}`;
}

const privateKey = resolvePrivateKey();
const account = privateKeyToAccount(privateKey);
const walletClient = createWalletClient({
  account,
  chain: base,
  transport: http(RPC_URL),
});

async function fundAccount(address: `0x${string}`) {
  const amount = parseEther("10");
  const amountHex = toHex(amount);
  try {
    await publicClient.request({
      method: "tenderly_addBalance",
      params: [address, amountHex],
    });
    return "tenderly_addBalance";
  } catch {
    await publicClient.request({
      method: "tenderly_setBalance",
      params: [address, amountHex],
    });
    return "tenderly_setBalance";
  }
}

async function forceTokenBalance({
  token,
  holder,
  amount,
}: {
  token: `0x${string}`;
  holder: `0x${string}`;
  amount: bigint;
}) {
  const slotIndex = 0n;
  const slot = keccak256(
    encodeAbiParameters(
      [
        { name: "account", type: "address" },
        { name: "slot", type: "uint256" },
      ],
      [holder, slotIndex]
    )
  );
  const value = toHex(amount, { size: 32 });
  await publicClient.request({
    method: "tenderly_setStorageAt",
    params: [token, slot, value],
  });
}

async function main() {
  const fundMethod = await fundAccount(account.address);

  const clanker = new Clanker({ wallet: walletClient, publicClient });

  const { txHash, waitForTransaction, error } = await clanker.deploy({
    name: metadata.name || "Agent Pulse",
    symbol: metadata.symbol || "PULSE",
    image: metadata.image,
    tokenAdmin: treasurySafe,
    metadata: {
      description: metadata.description,
      socialMediaUrls: metadata.socialMediaUrls || [],
    },
    context: {
      interface: "Clanker SDK",
    },
    pool: {
      pairedToken: "WETH",
      positions: POOL_POSITIONS.Standard,
    },
    fees: FEE_CONFIGS.StaticBasic,
    rewards: {
      recipients: [
        {
          recipient: treasurySafe,
          admin: treasurySafe,
          bps: 10_000,
          token: "Both",
        },
      ],
    },
    devBuy: {
      ethAmount: 0.001,
      recipient: account.address,
    },
    vanity: true,
  });

  if (error) throw error;

  const tokenReceipt = await waitForTransaction();
  const tokenAddress = tokenReceipt.address as `0x${string}`;

  const erc20Abi = [
    {
      type: "function",
      name: "balanceOf",
      stateMutability: "view",
      inputs: [{ name: "account", type: "address" }],
      outputs: [{ name: "", type: "uint256" }],
    },
    {
      type: "function",
      name: "transfer",
      stateMutability: "nonpayable",
      inputs: [
        { name: "to", type: "address" },
        { name: "amount", type: "uint256" },
      ],
      outputs: [{ name: "", type: "bool" }],
    },
  ] as const;

  const pulseAmount = parseEther("1");
  let balance = await publicClient.readContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account.address],
  });

  if (balance < pulseAmount) {
    if (process.env.ALLOW_STORAGE_PATCH === "1") {
      await forceTokenBalance({
        token: tokenAddress,
        holder: account.address,
        amount: pulseAmount,
      });
      balance = await publicClient.readContract({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [account.address],
      });
    }
  }

  if (balance < pulseAmount) {
    throw new Error(
      "Deployer has insufficient PULSE balance for pulse. Provide tokens or enable ALLOW_STORAGE_PATCH=1 on fork."
    );
  }

  const transferHash = await walletClient.writeContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: "transfer",
    args: [signalAddress, pulseAmount],
  });
  const transferReceipt = await publicClient.waitForTransactionReceipt({
    hash: transferHash,
  });

  const transferEvent = parseAbiItem(
    "event Transfer(address indexed from, address indexed to, uint256 value)"
  );

  const logs = await publicClient.getLogs({
    address: tokenAddress,
    event: transferEvent,
    args: { to: signalAddress },
    fromBlock: tokenReceipt.blockNumber,
    toBlock: "latest",
  });

  const report = {
    rpcUrl: RPC_URL,
    fundMethod,
    tokenTxHash: txHash,
    transferTxHash: transferHash,
    transferEvents: logs.length,
    transferBlock: transferReceipt.blockNumber?.toString(),
  };

  const reportPath = resolve("REPORTS", "tenderly", "agent-pulse-sim.json");
  writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log("Simulation complete.");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
