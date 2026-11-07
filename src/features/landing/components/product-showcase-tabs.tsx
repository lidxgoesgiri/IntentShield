"use client";

import { Tabs } from "radix-ui";
import { Lock } from "lucide-react";
import { TransactionInspector } from "@/features/verification/components/transaction-inspector";
import { VerificationStatus } from "@/features/verification/components/verification-status";
import type { VerificationResult } from "@/features/verification/types";
import { formatLamportsAsSol } from "@/lib/format/sol";

export type ShowcaseData = Readonly<{
  intent: { sender: string; recipient: string; amountLamports: bigint };
  blocked: { result: VerificationResult; messageBytes: Uint8Array };
  matched: { result: VerificationResult };
}>;

const TAB_TRIGGER =
  "inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] px-4 text-[0.9rem] text-silver transition-colors hover:text-white data-[state=active]:bg-raised data-[state=active]:text-white";

/** Interactive tabs: each tab genuinely changes content (PRD §10.1 S05). */
export function ProductShowcaseTabs({ data }: { data: ShowcaseData }) {
  return (
    <Tabs.Root defaultValue="outcome" className="space-y-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-4 py-3 sm:px-6">
        <Tabs.List aria-label="Product preview views" className="flex flex-wrap gap-1">
          <Tabs.Trigger value="intent" className={TAB_TRIGGER}>
            <span className="font-mono text-[0.8125rem] text-mint">01</span> Intent
          </Tabs.Trigger>
          <Tabs.Trigger value="inspector" className={TAB_TRIGGER}>
            <span className="font-mono text-[0.8125rem] text-mint">02</span> Inspector
          </Tabs.Trigger>
          <Tabs.Trigger value="outcome" className={TAB_TRIGGER}>
            <span className="font-mono text-[0.8125rem] text-mint">03</span> Outcome
          </Tabs.Trigger>
        </Tabs.List>
        <span className="font-mono text-[0.8125rem] uppercase tracking-[0.1em] text-muted">Sample data · not a network result</span>
      </div>

      <Tabs.Content value="intent" className="p-4 focus-visible:outline-offset-[-4px] sm:p-6">
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-3">
            <p className="type-eyebrow text-[0.8125rem]">Composer</p>
            <p className="rounded-[var(--radius-control)] border border-hairline bg-obsidian/60 p-4 font-heading text-[1.05rem] leading-relaxed text-white">
              Send 0.1 SOL to <span className="font-data break-all text-[0.9rem]">{data.intent.recipient}</span>
            </p>
            <p className="text-[0.875rem] text-silver">
              AI proposes an editable draft. Names are never resolved and the recipient must appear verbatim in what you typed.
            </p>
          </div>
          <div className="space-y-3">
            <p className="type-eyebrow text-[0.8125rem]">You requested</p>
            <dl className="divide-y divide-hairline rounded-[var(--radius-control)] border border-hairline text-[0.85rem]">
              <Row label="From" value={data.intent.sender} />
              <Row label="To" value={data.intent.recipient} />
              <Row label="Amount" value={`${formatLamportsAsSol(data.intent.amountLamports)} SOL · ${data.intent.amountLamports.toString()} lamports`} />
              <Row label="Network" value="Solana Devnet" plain />
            </dl>
            <p className="text-[0.875rem] text-silver">“Approve Intent” locks these exact values; signing is a separate step.</p>
          </div>
        </div>
      </Tabs.Content>

      <Tabs.Content value="inspector" className="p-4 focus-visible:outline-offset-[-4px] sm:p-6">
        <TransactionInspector result={data.blocked.result} messageBytes={data.blocked.messageBytes} />
      </Tabs.Content>

      <Tabs.Content value="outcome" className="space-y-5 p-4 focus-visible:outline-offset-[-4px] sm:p-6">
        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-3">
            <p className="type-eyebrow text-[0.8125rem]">Blocked sample</p>
            <VerificationStatus result={data.blocked.result} />
            <p className="flex min-h-12 items-center gap-2.5 rounded-[var(--radius-control)] border border-dashed border-hairline px-4 text-[0.925rem] text-muted">
              <Lock className="size-4" aria-hidden /> Signing gate: locked — no bypass while any check fails.
            </p>
          </div>
          <div className="space-y-3">
            <p className="type-eyebrow text-[0.8125rem]">Matched sample</p>
            <VerificationStatus result={data.matched.result} />
            <p className="text-[0.875rem] text-silver">
              In the real app, a match still waits for a passing Devnet simulation (Simulation row) before your wallet is asked
              to sign — and the confirmed receipt links to Solana Explorer.
            </p>
          </div>
        </div>
      </Tabs.Content>
    </Tabs.Root>
  );
}

function Row({ label, value, plain }: { label: string; value: string; plain?: boolean }) {
  return (
    <div className="grid gap-1 px-4 py-2.5 sm:grid-cols-[5rem_1fr] sm:gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className={plain ? "text-white" : "font-data text-white"}>{value}</dd>
    </div>
  );
}
