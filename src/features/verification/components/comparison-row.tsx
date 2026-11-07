"use client";

import { CircleCheck, CircleHelp, CircleSlash, TriangleAlert } from "lucide-react";
import { AddressDiff } from "@/components/ui/address-diff";
import { Tooltip } from "@/components/ui/tooltip";
import { formatLamportsAsSol, formatLamportsGrouped } from "@/lib/format/sol";
import { cn } from "@/lib/utils";
import type { ComparisonField, ComparisonRow as Row } from "../types";

export const FIELD_COPY: Record<ComparisonField, { label: string; why: string }> = {
  action: {
    label: "Action",
    why: "Only a single native SOL transfer is supported. Any other instruction could move assets or grant permissions you never approved.",
  },
  sender: { label: "From", why: "Funds must leave your connected wallet — and no other account." },
  recipient: {
    label: "To",
    why: "One changed character sends funds to someone else. Compare the full address, not just the first and last characters.",
  },
  amount: { label: "Amount", why: "Amounts are exact integers in lamports: 1 SOL = 1,000,000,000 lamports." },
  feePayer: { label: "Fee payer", why: "The account paying the network fee must be your wallet." },
  program: { label: "Program", why: "The instruction must target the System Program (11111111111111111111111111111111)." },
  network: { label: "Network", why: "Devnet only. The RPC's genesis hash must match Solana Devnet; mainnet is disabled." },
  instructions: {
    label: "Instructions",
    why: "Extra instructions could do things you never approved. Only one transfer is allowed, plus IntentShield's own fixed compute budget (1,000 units at 1 micro-lamport), which stops wallets from inserting their own fee instructions.",
  },
};

const STATE_VIEW = {
  match: { label: "Match", icon: CircleCheck, className: "text-mint" },
  changed: { label: "Changed", icon: TriangleAlert, className: "text-warning" },
  unsupported: { label: "Unsupported", icon: CircleSlash, className: "text-danger" },
} as const;

function isAddressField(field: ComparisonField) {
  return field === "sender" || field === "recipient" || field === "feePayer" || field === "program";
}

function formatValue(field: ComparisonField, value: string | null) {
  if (value === null) return null;
  if (field === "amount") {
    try {
      const lamports = BigInt(value);
      return `${formatLamportsAsSol(lamports)} SOL · ${formatLamportsGrouped(lamports)} lamports`;
    } catch {
      return value;
    }
  }
  return value;
}

export function ComparisonRowView({ row }: { row: Row }) {
  const copy = FIELD_COPY[row.field];
  const view = STATE_VIEW[row.state];
  const Icon = view.icon;
  const expected = formatValue(row.field, row.expected);
  const actual = formatValue(row.field, row.actual);
  const showDiff = row.state === "changed" && isAddressField(row.field) && row.actual !== null;

  return (
    <div role="row" className="grid gap-x-4 gap-y-1.5 border-b border-hairline px-4 py-3.5 last:border-b-0 md:grid-cols-[7.5rem_1fr_1fr_7.5rem]">
      <div role="rowheader" className="flex items-center gap-1.5 text-[0.9rem] font-medium text-white">
        {copy.label}
        <Tooltip content={<><strong className="text-white">Why this matters: </strong>{copy.why}</>}>
          <button type="button" className="-m-2 inline-flex size-9 items-center justify-center rounded-full text-muted hover:text-white" aria-label={`Why ${copy.label} matters`}>
            <CircleHelp className="size-3.5" aria-hidden />
          </button>
        </Tooltip>
      </div>
      <div role="cell" className="min-w-0">
        <span className="type-caption md:hidden">You intended · </span>
        <span className={cn("text-[0.85rem] text-silver", isAddressField(row.field) || row.field === "amount" ? "font-data" : "")}>{expected}</span>
      </div>
      <div role="cell" className="min-w-0">
        <span className="type-caption md:hidden">Transaction will execute · </span>
        {showDiff ? (
          <AddressDiff expected={row.expected} actual={row.actual ?? ""} className="text-[0.85rem] text-white" />
        ) : (
          <span className={cn("text-[0.85rem] text-white", isAddressField(row.field) || row.field === "amount" ? "font-data" : "")}>
            {actual ?? <span className="text-muted">Not present</span>}
          </span>
        )}
      </div>
      <div role="cell" className={cn("flex items-center gap-1.5 font-mono text-[0.75rem] font-medium uppercase tracking-[0.08em]", view.className)}>
        <Icon className="size-4" aria-hidden />
        {view.label}
      </div>
    </div>
  );
}
