import { isSignature } from "@solana/kit";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ReceiptLookup } from "@/features/receipt/components/receipt-lookup";

export const metadata: Metadata = {
  title: "Transaction receipt",
  description: "On-chain status of a Solana Devnet transaction, read directly from RPC.",
};

export default async function TransactionPage({ params }: PageProps<"/tx/[signature]">) {
  const { signature } = await params;
  const decoded = decodeURIComponent(signature);
  if (!isSignature(decoded)) notFound();

  return (
    <main id="main" className="page-container max-w-3xl space-y-8 py-10 sm:py-14">
      <header className="space-y-3">
        <p className="type-eyebrow">
          <span className="text-mint">Solana Devnet</span> · status read from RPC
        </p>
        <h1 className="font-display text-[clamp(1.9rem,4vw,3rem)] font-semibold leading-[1.05] tracking-[-0.03em] text-white">
          Transaction receipt
        </h1>
        <p className="font-data text-[0.9rem] text-silver">{decoded}</p>
      </header>
      <ReceiptLookup signature={decoded} />
    </main>
  );
}
