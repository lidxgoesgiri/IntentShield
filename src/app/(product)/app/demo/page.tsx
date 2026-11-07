import type { Metadata } from "next";
import { SecurityProofLab } from "@/features/demo/components/security-proof-lab";

export const metadata: Metadata = {
  title: "Demo Lab",
  description: "Controlled, unsigned sample transactions showing how IntentShield blocks mismatches before signing.",
};

export default function DemoLabPage() {
  return (
    <main id="main" className="page-container space-y-10 py-8 sm:py-12">
      <header className="page-intro">
        <p className="type-eyebrow">
          <span className="text-mint">Demo Lab</span> · same verifier as the real app
        </p>
        <h1 className="page-title max-w-3xl">
          Watch a mismatch get blocked.
        </h1>
        <p className="type-lead">
          Change a sample transaction and inspect the difference. Every verdict is computed from its actual bytes by the production verifier.
        </p>
      </header>
      <SecurityProofLab />
    </main>
  );
}
