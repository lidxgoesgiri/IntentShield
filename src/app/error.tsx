"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * Route error boundary. Shows a calm, sanitized message — never stack traces —
 * and never implies a transaction succeeded.
 */
export default function ErrorBoundary({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="main" className="page-container flex min-h-[70dvh] flex-col items-start justify-center gap-6 py-20">
      <p className="type-eyebrow">Something went wrong</p>
      <h1 className="page-title max-w-2xl">This view could not be displayed.</h1>
      <p className="max-w-2xl text-silver">This error does not establish whether a wallet request or transaction completed. If you already approved a request in your wallet, check its transaction history or receipt before sending again.</p>
      <p className="max-w-2xl text-silver">Open the workspace and reconnect the wallet used for the transfer to recover its recorded receipt. Recovery never creates or signs another transfer.</p>
      <div className="flex flex-wrap gap-3">
        <Button onClick={reset}>Try again</Button>
        <Button asChild variant="secondary">
          <Link href="/app">Open workspace</Link>
        </Button>
        <Button asChild variant="ghost">
          <Link href="/">Back to home</Link>
        </Button>
      </div>
    </main>
  );
}
