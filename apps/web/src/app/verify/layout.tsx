import { notFound } from "next/navigation";

/**
 * Dev-only layout gate — the /verify dashboard requires a local Anvil fork
 * and is not useful in production. Returns 404 on Vercel/production builds.
 */
export default function VerifyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return <>{children}</>;
}
