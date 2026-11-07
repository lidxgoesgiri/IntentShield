import type { Metadata } from "next";
import Link from "next/link";
import { TransferWorkspace } from "@/features/transfer/components/transfer-workspace";

export const metadata: Metadata = {
  title: "Workspace",
  description: "Prepare, verify, simulate and sign a native SOL transfer on Solana Devnet.",
};

export default function AppPage() {
  return (
    <main id="main" className="page-container space-y-8 py-8 sm:py-12">
      <header className="page-intro lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-3">
          <p className="type-eyebrow">
            <span className="text-mint">Real Devnet</span> · wallet-signed · deterministic checks
          </p>
          <h1 className="page-title">
            Know what you sign.
          </h1>
          <p className="type-lead">
            Describe a SOL transfer. Review the exact values, verify the message, then decide in your wallet.
          </p>
        </div>
        <p className="type-caption max-w-sm lg:text-right">
          Want to see a mismatch first? Open the{" "}
          <Link href="/app/demo" className="text-white underline decoration-mint/60 underline-offset-4 hover:decoration-mint">
            Demo Lab
          </Link>{" "}
          — controlled samples, no funds moved.
        </p>
      </header>
      <TransferWorkspace />
    </main>
  );
}
