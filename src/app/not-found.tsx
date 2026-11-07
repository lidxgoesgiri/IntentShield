import Link from "next/link";
import { BrandMark } from "@/components/layout/brand-mark";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main id="main" className="page-container flex min-h-dvh flex-col items-start justify-center gap-6 py-20">
      <BrandMark className="size-12" />
      <p className="type-eyebrow">404 · Not found</p>
      <h1 className="page-title max-w-3xl">This page does not exist.</h1>
      <p className="type-lead">
        If you followed a receipt link, check that the complete Solana transaction signature was copied correctly.
      </p>
      <div className="flex flex-wrap gap-3">
        <Button asChild>
          <Link href="/">Back to IntentShield</Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href="/app">Open the workspace</Link>
        </Button>
      </div>
    </main>
  );
}
