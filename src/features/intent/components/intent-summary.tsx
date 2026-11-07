"use client";

import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { formatLamportsAsSol, formatLamportsGrouped } from "@/lib/format/sol";

/**
 * "You requested" summary + explicit Approve Intent (PRD FR-004).
 * Approval is a separate action from signing.
 */
export function IntentSummary({
  sender,
  recipient,
  amountLamports,
  canApprove,
  approveHint,
  approved,
  onApprove,
}: {
  sender: string | null;
  recipient: string | null;
  amountLamports: bigint | null;
  canApprove: boolean;
  approveHint: string | null;
  approved: boolean;
  onApprove: () => void;
}) {
  return (
    <section aria-labelledby="summary-heading" className="space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 id="summary-heading" className="font-display text-lg font-semibold text-white">
          You requested
        </h3>
        <span className="type-caption">Solana Devnet</span>
      </div>
      <dl className="divide-y divide-hairline rounded-[var(--radius-control)] border border-hairline">
        <Row label="From (your wallet)" value={sender} copyLabel="sender address" empty="Connect a Devnet wallet to continue." />
        <Row label="To (recipient)" value={recipient} copyLabel="recipient address" empty="—" />
        <div className="grid gap-1 px-4 py-3 sm:grid-cols-[9rem_1fr] sm:gap-4">
          <dt className="type-caption pt-0.5">Amount</dt>
          <dd className="font-data text-white">
            {amountLamports === null ? (
              "—"
            ) : (
              <>
                {formatLamportsAsSol(amountLamports)} SOL{" "}
                <span className="text-muted">= {formatLamportsGrouped(amountLamports)} lamports</span>
              </>
            )}
          </dd>
        </div>
        <div className="grid gap-1 px-4 py-3 sm:grid-cols-[9rem_1fr] sm:gap-4">
          <dt className="type-caption pt-0.5">Network</dt>
          <dd className="text-white">Solana Devnet</dd>
        </div>
      </dl>
      <div className="space-y-2">
        <Button size="lg" className="w-full sm:w-auto" onClick={onApprove} disabled={!canApprove || approved}>
          <ShieldCheck className="size-5" aria-hidden />
          {approved ? "Intent approved" : "Approve Intent"}
        </Button>
        {approveHint ? <p className="type-caption">{approveHint}</p> : null}
        <p className="type-caption">
          Approving locks these exact values. Editing anything afterwards discards the approval and every check.
        </p>
      </div>
    </section>
  );
}

function Row({ label, value, copyLabel, empty }: { label: string; value: string | null; copyLabel: string; empty: string }) {
  return (
    <div className="grid gap-1 px-4 py-3 sm:grid-cols-[9rem_1fr] sm:gap-4">
      <dt className="type-caption pt-0.5">{label}</dt>
      <dd className="flex min-w-0 items-start gap-1">
        {value ? (
          <>
            <span className="font-data min-w-0 flex-1 pt-2.5 text-[0.85rem] leading-snug text-white">{value}</span>
            <CopyButton value={value} label={copyLabel} />
          </>
        ) : (
          <span className="text-muted">{empty}</span>
        )}
      </dd>
    </div>
  );
}
