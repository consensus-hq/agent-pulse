export const pulseRegistryAbi = [
  {
    type: "function",
    name: "lastPulseAt",
    stateMutability: "view",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [{ name: "", type: "uint64" }],
  },
  {
    type: "function",
    name: "lastPulseBlock",
    stateMutability: "view",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [{ name: "", type: "uint64" }],
  },
  {
    type: "function",
    name: "isAlive",
    stateMutability: "view",
    inputs: [
      { name: "agent", type: "address" },
      { name: "ttlSeconds", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;
