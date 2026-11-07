import type { Metadata } from "next";
import { SecurityProofLab } from "@/features/demo/components/security-proof-lab";

export const metadata: Metadata = {
  title: "Demo Lab",
  description: "Controlled, unsigned sample transactions showing how IntentShield blocks mismatches before signing.",
};

export default function DemoLabPage() {
  return (
    <main id="main" className="page-container space-y-10 py-8 sm:py-12">
      <header className="max-w-3xl space-y-3">
        <p className="type-eyebrow">
          <span className="text-mint">Demo Lab</span> · same verifier as the real app
        </p>
        <h1 className="font-display text-[clamp(2rem,4.2vw,3.25rem)] font-semibold leading-[1.02] tracking-[-0.03em] text-white">
          Watch a mismatch get blocked.
        </h1>
        <p className="type-lead">
          Each scenario hands the production verifier a deliberately altered, unsigned transaction. The verdict below is
          computed live from the decoded bytes — not a canned badge.
        </p>
      </header>
      <SecurityProofLab />
    </main>
  );
}
