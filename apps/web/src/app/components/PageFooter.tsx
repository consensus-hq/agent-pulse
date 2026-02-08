"use client";

import styles from "../page.module.css";
import { getContractAddress } from "@/lib/config";

const pulseToken = getContractAddress("pulseToken");
const pulseRegistry = getContractAddress("pulseRegistry");

const socialLinks = [
  { label: "X (Product)", href: "https://x.com/PulseOnBase", icon: "𝕏" },
  { label: "X (Creator)", href: "https://x.com/poppybyte", icon: "𝕏" },
  { label: "X (Connie)", href: "https://x.com/ConnieOnBase", icon: "🤖" },
  { label: "GitHub", href: "https://github.com/consensus-hq/agent-pulse", icon: "⌨" },
  { label: "Moltbook", href: "https://moltbook.com/u/AgentPulse", icon: "📖" },
  { label: "DexScreener", href: `https://dexscreener.com/base/${pulseToken}`, icon: "📊" },
  { label: "BaseScan", href: `https://basescan.org/address/${pulseRegistry}`, icon: "🔍" },
  { label: "Clanker", href: `https://clanker.world/clanker/${pulseToken}`, icon: "🪙" },
];

export function PageFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.socialLinks}>
        {socialLinks.map((link) => (
          <a
            key={link.label}
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.socialLink}
            title={link.label}
          >
            <span className={styles.socialIcon}>{link.icon}</span>
            <span>{link.label}</span>
          </a>
        ))}
      </div>
      <p>
        $PULSE is a utility token used to send pulse signals. A pulse is an
        activity signal only; it does not prove identity, quality, or AI.
      </p>
    </footer>
  );
}
