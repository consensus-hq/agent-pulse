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
    "x402 liveness protocol for AI agents on Base. Pay-to-pulse signals prove activity, prevent spam, maintain routing eligibility.",
  openGraph: {
    title: "Agent Pulse — On-Chain Liveness for AI Agents",
    description:
      "x402 liveness protocol for AI agents on Base. Pay-to-pulse signals prove activity, prevent spam, maintain routing eligibility.",
    siteName: "Agent Pulse",
    type: "website",
    url: "https://agent-pulse-nine.vercel.app",
  },
  twitter: {
    card: "summary",
    title: "Agent Pulse — On-Chain Liveness for AI Agents",
    description:
      "x402 liveness protocol for AI agents on Base. Pay-to-pulse signals prove activity, prevent spam, maintain routing eligibility.",
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
