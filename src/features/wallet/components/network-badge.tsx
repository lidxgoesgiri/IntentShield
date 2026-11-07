"use client";

import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useProductContext } from "../product-context";

/**
 * Network indicator backed by a real RPC genesis-hash check. It only says
 * "Solana Devnet" once the RPC has proven it (PRD: DEVNET labels only on
 * network-backed components).
 */
export function NetworkBadge({ className, compact = false }: { className?: string; compact?: boolean }) {
  const { devnet, online } = useProductContext();

  const view = !online
    ? { dot: "bg-danger", text: "Offline", tip: "Your browser is offline. Signing and AI are disabled until you reconnect." }
    : devnet.state === "verified"
      ? { dot: "bg-mint", text: "Solana Devnet", tip: "The RPC's genesis hash matches Solana Devnet. Mainnet is disabled in this MVP." }
      : devnet.state === "checking"
        ? { dot: "bg-muted", text: "Checking network", tip: "Verifying the RPC genesis hash…" }
        : { dot: "bg-danger", text: devnet.state === "wrong-network" ? "Wrong network" : "Network unverified", tip: devnet.message };

  return (
    <Tooltip content={view.tip} side="bottom">
      <span
        tabIndex={0}
        className={cn(
          "inline-flex min-h-9 items-center gap-2 rounded-full border border-hairline bg-carbon px-2 font-mono text-[0.8125rem] uppercase tracking-[0.04em] text-silver",
          className,
        )}
        aria-label={`Network: ${view.text}. ${view.tip}`}
      >
        <span aria-hidden className={cn("size-2 rounded-full", view.dot, devnet.state === "checking" && "animate-pulse")} />
        {compact && view.text === "Solana Devnet" ? "Devnet" : view.text}
      </span>
    </Tooltip>
  );
}
