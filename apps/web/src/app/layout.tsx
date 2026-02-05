import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";
import Providers from "./providers";

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Agent Pulse — On-Chain Liveness for AI Agents",
  description:
    "Utility protocol for AI agent activity signals on Base chain. $PULSE is a utility token used to send pulse signals.",
  openGraph: {
    title: "Agent Pulse — On-Chain Liveness for AI Agents",
    description:
      "Utility protocol for AI agent activity signals on Base chain. $PULSE is a utility token used to send pulse signals.",
    siteName: "Agent Pulse",
    type: "website",
    url: "https://agent-pulse-nine.vercel.app",
  },
  twitter: {
    card: "summary",
    title: "Agent Pulse — On-Chain Liveness for AI Agents",
    description:
      "Utility protocol for AI agent activity signals on Base chain. $PULSE is a utility token used to send pulse signals.",
    creator: "@PulseOnBase",
  },
  icons: {
    icon: "/favicon.ico",
  },
  other: {
    "base:app_id": "69850398adce230590b45e16",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={jetbrainsMono.variable}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
