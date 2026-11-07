import { CircleCheck } from "lucide-react";
import { shortenAddress } from "@/lib/format/address";
import { cn } from "@/lib/utils";
import { DEMO_PARTIES } from "../simulator/demo-fixtures.generated";

/**
 * Hero sample cards — clearly labeled DEMO / SAMPLE DATA. They illustrate the
 * workflow; they are not RPC results and are not clickable as if real.
 */
export function SampleIntentCard({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-[var(--radius-panel)] border border-hairline bg-carbon/95 p-4 shadow-[0_24px_60px_-28px_rgb(0_0_0/0.9)]", className)}>
      <div className="flex items-center justify-between gap-3">
        <p className="type-eyebrow text-[0.68rem]">Sample intent</p>
        <span className="rounded-full border border-dashed border-silver/30 px-2 py-0.5 font-mono text-[0.62rem] uppercase tracking-[0.1em] text-silver">
          Demo / sample data
        </span>
      </div>
      <p className="mt-3 font-heading text-[1.05rem] leading-snug text-white">
        “Send <span className="text-mint">0.1 SOL</span> to <span className="font-data">{shortenAddress(DEMO_PARTIES.recipient, 6, 6)}</span>”
      </p>
      <p className="mt-2 font-data text-[0.75rem] text-muted">= 100,000,000 lamports · native SOL</p>
    </div>
  );
}

const ROWS = [
  { field: "Program", value: "System · Transfer" },
  { field: "Recipient", value: shortenAddress(DEMO_PARTIES.recipient, 4, 4) },
  { field: "Amount", value: "100,000,000" },
  { field: "Fee payer", value: shortenAddress(DEMO_PARTIES.sender, 4, 4) },
] as const;

export function SampleCheckCard({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-[var(--radius-panel)] border border-hairline bg-carbon/95 p-4 shadow-[0_24px_60px_-28px_rgb(0_0_0/0.9)]", className)}>
      <div className="flex items-center justify-between gap-3">
        <p className="type-eyebrow text-[0.68rem]">Sample check</p>
        <span className="font-mono text-[0.62rem] uppercase tracking-[0.1em] text-muted">Fixture · not RPC</span>
      </div>
      <dl className="mt-3 divide-y divide-hairline">
        {ROWS.map((row) => (
          <div key={row.field} className="flex items-center justify-between gap-3 py-1.5 text-[0.78rem]">
            <dt className="text-muted">{row.field}</dt>
            <dd className="flex items-center gap-2 font-data text-white">
              {row.value}
              <span className="inline-flex items-center gap-1 font-mono text-[0.62rem] uppercase tracking-[0.08em] text-mint">
                <CircleCheck className="size-3" aria-hidden /> Match
              </span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
