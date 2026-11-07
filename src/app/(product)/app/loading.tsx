import { Skeleton } from "@/components/ui/misc";

export default function ProductLoading() {
  return (
    <main id="main" className="page-container space-y-8 py-8 sm:py-12" aria-busy="true">
      <header className="page-intro">
        <p className="type-eyebrow">IntentShield · Solana Devnet</p>
        <h1 className="page-title">Opening IntentShield.</h1>
        <p role="status" className="text-silver">Loading the interface. Check any previous transaction receipt before sending again.</p>
      </header>
      <div aria-hidden className="grid gap-6 lg:grid-cols-2">
        <div className="hairline-panel panel-space space-y-5"><Skeleton className="h-6 w-40" /><Skeleton className="h-28 w-full" /><Skeleton className="h-11 w-36" /></div>
        <div className="hairline-panel panel-space space-y-5"><Skeleton className="h-6 w-56 max-w-full" /><Skeleton className="h-48 w-full" /></div>
      </div>
    </main>
  );
}
