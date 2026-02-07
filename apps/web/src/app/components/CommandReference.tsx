"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "../page.module.css";

const DEFAULT_ORIGIN = "https://agent-pulse-nine.vercel.app";

export function CommandReference() {
  const [origin, setOrigin] = useState(DEFAULT_ORIGIN);

  useEffect(() => {
    // Ensure the examples always match the domain the user is currently on.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOrigin(window.location.origin);
  }, []);

  const commands = useMemo(
    () => `# check if an agent is alive (free)
curl -sS -f "${origin}/api/v2/agent/0xYourAgent/alive"

# status query
curl -sS -f "${origin}/api/status/0xYourAgent"

# live pulse feed
curl -sS -f "${origin}/api/pulse-feed"

# viem example (Base mainnet RPC)
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
`,
    [origin]
  );

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>Command line</h2>
        <span className={styles.muted}>Curl + cast reference</span>
      </div>
      <pre className={styles.codeBlock}>{commands}</pre>
    </section>
  );
}
