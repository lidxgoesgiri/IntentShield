import Link from "next/link";
import type { ReactNode } from "react";
import { NetworkBadge } from "@/features/wallet/components/network-badge";
import { WalletConnectButton } from "@/features/wallet/components/wallet-connect-button";
import { BrandMark, BrandWordmark } from "./brand-mark";
import { ProductNav } from "./product-nav";

/** Product chrome for /app, /app/demo and /tx — separate from the marketing header. */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="product-shell flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-hairline bg-obsidian/90 backdrop-blur-md">
        <div className="page-container flex min-h-[72px] flex-wrap items-center gap-x-4 gap-y-2 py-3">
          <Link href="/" className="flex min-h-11 items-center gap-2.5 rounded-[var(--radius-control)]" aria-label="IntentShield home">
            <BrandMark className="size-8" />
            <BrandWordmark className="hidden sm:inline" />
          </Link>
          <div className="order-3 flex w-full flex-wrap items-center justify-between gap-2 sm:order-none sm:w-auto">
            <ProductNav />
            <NetworkBadge compact className="md:hidden" />
          </div>
          <div className="ml-auto flex items-center gap-2.5">
            <NetworkBadge className="hidden md:inline-flex" />
            <WalletConnectButton />
          </div>
        </div>
      </header>
      <div className="flex-1">{children}</div>
      <footer className="border-t border-hairline">
        <div className="page-container flex flex-col gap-2 py-6 text-[0.85rem] text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>IntentShield · Solana Devnet only · non-custodial · native SOL transfers only.</p>
          <p>Checks do not establish recipient trustworthiness.</p>
        </div>
      </footer>
    </div>
  );
}
