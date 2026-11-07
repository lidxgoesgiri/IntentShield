import { ArrowUpRight, CircleCheck, CircleX, Clock, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { CopyButton } from "@/components/ui/copy-button";
import { Spinner } from "@/components/ui/misc";
import { formatLamportsAsSol } from "@/lib/format/sol";
import { cn } from "@/lib/utils";
import type { ReceiptStatus } from "@/features/transfer/types";
import { explorerTransactionUrl } from "../lib/explorer-url";

const STATUS_VIEW: Record<ReceiptStatus, { label: string; tone: string; icon: React.ReactNode; note: string }> = {
  submitted: {
    label: "Submitted",
    tone: "text-silver",
    icon: <Spinner />,
    note: "Transaction submitted. Waiting for on-chain confirmation.",
  },
  confirming: { label: "Confirming", tone: "text-silver", icon: <Spinner />, note: "Waiting for the network to confirm…" },
  confirmed: {
    label: "Confirmed",
    tone: "text-mint",
    icon: <CircleCheck className="size-5" aria-hidden />,
    note: "Confirmed on Solana Devnet.",
  },
  onchain_failed: {
    label: "Failed on chain",
    tone: "text-danger",
    icon: <CircleX className="size-5" aria-hidden />,
    note: "The transaction landed but the network reported an error.",
  },
  expired: {
    label: "Expired",
    tone: "text-warning",
    icon: <Clock className="size-5" aria-hidden />,
    note: "Its blockhash expired before confirmation, so it can no longer land.",
  },
  unknown: {
    label: "Unknown",
    tone: "text-warning",
    icon: <TriangleAlert className="size-5" aria-hidden />,
    note: "Confirmation was not observed in time. Check the explorer before trying again.",
  },
};

export type ReceiptCardData = Readonly<{
  status: ReceiptStatus;
  signature: string;
  amountLamports: bigint | null;
  sender: string | null;
  recipient: string | null;
  feeLamports: bigint | null;
  blockTime: bigint | null;
  slot: bigint | null;
  confirmationStatus: string | null;
  error: string | null;
}>;

/** ReceiptCard states: submitted, confirming, confirmed, on-chain-failed, expired, unknown (PRD §12). */
export function ReceiptCard({ data, showPermalink = true }: { data: ReceiptCardData; showPermalink?: boolean }) {
  const view = STATUS_VIEW[data.status];
  const explorer = explorerTransactionUrl(data.signature);
  const time =
    data.blockTime !== null ? new Date(Number(data.blockTime) * 1000).toISOString().replace("T", " ").replace(".000Z", " UTC") : null;

  return (
    <section aria-labelledby="receipt-heading" className="space-y-4 rounded-[var(--radius-panel)] border border-hairline bg-obsidian/50 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id="receipt-heading" className="font-display text-lg font-semibold text-white">
          Receipt
        </h3>
        <span className={cn("inline-flex items-center gap-2 font-mono text-[0.8rem] uppercase tracking-[0.08em]", view.tone)} role="status">
          {view.icon}
          {view.label}
        </span>
      </div>
      <p className="text-[0.925rem] text-silver">{data.error ?? view.note}</p>
      <dl className="divide-y divide-hairline rounded-[var(--radius-control)] border border-hairline text-[0.85rem]">
        <Item label="Signature">
          <span className="font-data min-w-0 flex-1 pt-2.5 text-white">{data.signature}</span>
          <CopyButton value={data.signature} label="transaction signature" />
        </Item>
        {data.amountLamports !== null ? (
          <Item label="Amount">
            <span className="font-data pt-2.5 text-white">{formatLamportsAsSol(data.amountLamports)} SOL</span>
          </Item>
        ) : null}
        {data.sender ? (
          <Item label="From">
            <span className="font-data min-w-0 flex-1 pt-2.5 text-white">{data.sender}</span>
          </Item>
        ) : null}
        {data.recipient ? (
          <Item label="To">
            <span className="font-data min-w-0 flex-1 pt-2.5 text-white">{data.recipient}</span>
          </Item>
        ) : null}
        {data.feeLamports !== null ? (
          <Item label="Network fee">
            <span className="font-data pt-2.5 text-white">{formatLamportsAsSol(data.feeLamports)} SOL</span>
          </Item>
        ) : null}
        {time ? (
          <Item label="Block time">
            <span className="font-data pt-2.5 text-white">{time}</span>
          </Item>
        ) : null}
        <Item label="Cluster">
          <span className="pt-2.5 text-white">Solana Devnet{data.confirmationStatus ? ` · ${data.confirmationStatus}` : ""}</span>
        </Item>
      </dl>
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        {explorer ? (
          <a href={explorer} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1.5 text-[0.925rem] text-white underline decoration-mint/60 underline-offset-[6px] hover:decoration-mint">
            View on Solana Explorer (Devnet) <ArrowUpRight className="size-4" aria-hidden />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        ) : null}
        {showPermalink ? (
          <Link
            href={`/tx/${data.signature}`}
            className="inline-flex min-h-11 items-center gap-1.5 text-[0.925rem] text-silver underline decoration-hairline underline-offset-[6px] hover:text-white"
          >
            Receipt page
          </Link>
        ) : null}
      </div>
      <p className="type-caption">Explorer proof verifies the on-chain result, not the safety or trustworthiness of the recipient.</p>
    </section>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 px-4 py-2 sm:grid-cols-[7.5rem_1fr] sm:gap-4">
      <dt className="type-caption pt-2.5">{label}</dt>
      <dd className="flex min-w-0 items-start gap-1">{children}</dd>
    </div>
  );
}
