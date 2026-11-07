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
      <h1 className="type-h3 max-w-2xl">This view failed to load. No transaction was signed or sent because of this error.</h1>
      <div className="flex flex-wrap gap-3">
        <Button onClick={reset}>Try again</Button>
        <Button asChild variant="secondary">
          <Link href="/">Back to home</Link>
        </Button>
      </div>
    </main>
  );
}
