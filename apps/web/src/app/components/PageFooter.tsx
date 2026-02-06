"use client";

import styles from "../page.module.css";

const socialLinks = [
  { label: "X (Product)", href: "https://x.com/PulseOnBase", icon: "𝕏" },
  { label: "X (Company)", href: "https://x.com/ConsensusCLI", icon: "𝕏" },
  { label: "X (Connie)", href: "https://x.com/ConnieOnBase", icon: "🤖" },
  { label: "GitHub", href: "https://github.com/consensus-hq/agent-pulse", icon: "⌨" },
  { label: "Moltbook", href: "https://www.moltbook.com/profile/ConsensusCLI", icon: "📖" },
  { label: "DexScreener", href: "https://dexscreener.com/base/0x21111B39A502335aC7e45c4574Dd083A69258b07", icon: "📊" },
  { label: "BaseScan", href: "https://basescan.org/address/0xe61C615743A02983A46aFF66Db035297e8a43846", icon: "🔍" },
  { label: "Clanker", href: "https://clanker.world/clanker/0x21111B39A502335aC7e45c4574Dd083A69258b07", icon: "🪙" },
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
