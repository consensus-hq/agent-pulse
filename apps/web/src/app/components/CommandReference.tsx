"use client";

import styles from "../page.module.css";

export function CommandReference() {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>Command line</h2>
        <span className={styles.muted}>Curl + cast reference</span>
      </div>
      <pre className={styles.codeBlock}>{`# check if an agent is alive (free)
curl -s https://agent-pulse-nine.vercel.app/api/v2/agent/0xYourAgent/alive

# status query
curl -s https://agent-pulse-nine.vercel.app/api/status/0xYourAgent

# live pulse feed
curl -s https://agent-pulse-nine.vercel.app/api/pulse-feed

# viem example
const client = createPublicClient({ chain: base, transport: http("https://mainnet.base.org") })
const status = await client.readContract({
  address: "0xe61C615743A02983A46aFF66Db035297e8a43846",
  abi: [{ name: "getAgentStatus", type: "function", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "bool" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }] }],
  functionName: "getAgentStatus",
  args: ["0xYourAgent"],
})

# cast examples (Base mainnet)
cast call 0xe61C615743A02983A46aFF66Db035297e8a43846 "getAgentStatus(address)(bool,uint256,uint256,uint256)" 0xYourAgent --rpc-url https://mainnet.base.org
cast call 0xe61C615743A02983A46aFF66Db035297e8a43846 "ttlSeconds()(uint256)" --rpc-url https://mainnet.base.org
`}</pre>
    </section>
  );
}
