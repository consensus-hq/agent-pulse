"use client";

import styles from "../page.module.css";

export function CommandReference() {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>Command line</h2>
        <span className={styles.muted}>Curl + cast reference</span>
      </div>
      <pre className={styles.codeBlock}>{`# status query
curl -s https://<host>/api/status/0xYourAgent

# live pulse feed
curl -s https://<host>/api/pulse-feed

# viem example
const client = createPublicClient({ chain: base, transport: http(process.env.NEXT_PUBLIC_BASE_RPC_URL) })
const status = await client.readContract({
  address: process.env.NEXT_PUBLIC_PULSE_REGISTRY_ADDRESS,
  abi: [{ name: "getAgentStatus", type: "function", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "bool" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }] }],
  functionName: "getAgentStatus",
  args: ["0xYourAgent"],
})

# cast examples
cast call 0xRegistry "getAgentStatus(address)(bool,uint256,uint256,uint256)" 0xYourAgent --rpc-url $BASE_RPC_URL
cast call 0xRegistry "ttlSeconds()(uint256)" --rpc-url $BASE_RPC_URL
`}</pre>
    </section>
  );
}
