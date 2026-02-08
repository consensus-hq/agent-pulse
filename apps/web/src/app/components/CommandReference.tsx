"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "../page.module.css";
import { getAppUrl, getContractAddress, getRpcUrl } from "@/lib/config";

export function CommandReference() {
  const [origin, setOrigin] = useState(getAppUrl);

  useEffect(() => {
    // Ensure the examples always match the domain the user is currently on.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOrigin(window.location.origin);
  }, []);

  const registryAddress = getContractAddress("pulseRegistry");
  const rpcUrl = getRpcUrl();

  const commands = useMemo(
    () => `# check if an agent is alive (free)
curl -sS -f "${origin}/api/v2/agent/0xYourAgent/alive"

# status query
curl -sS -f "${origin}/api/status/0xYourAgent"

# live pulse feed
curl -sS -f "${origin}/api/pulse-feed"

# viem example (Base mainnet RPC)
const client = createPublicClient({ chain: base, transport: http("${rpcUrl}") })
const status = await client.readContract({
  address: "${registryAddress}",
  abi: [{ name: "getAgentStatus", type: "function", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "bool" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }] }],
  functionName: "getAgentStatus",
  args: ["0xYourAgent"],
})

# cast examples (Base mainnet)
cast call ${registryAddress} "getAgentStatus(address)(bool,uint256,uint256,uint256)" 0xYourAgent --rpc-url ${rpcUrl}
cast call ${registryAddress} "ttlSeconds()(uint256)" --rpc-url ${rpcUrl}
`,
    [origin, registryAddress, rpcUrl]
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
