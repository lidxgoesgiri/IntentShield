import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { PROBLEM_STATUSES, STEPS, stepOf } from "../lib/status-copy";
import type { TransferStatus } from "../types";

/** Describe → Review → Verify → Sign → Confirm progress (PRD §10.2). */
export function TransactionStepper({ status }: { status: TransferStatus }) {
  const currentIndex = STEPS.findIndex((step) => step.id === stepOf(status));
  const problem = PROBLEM_STATUSES.has(status);
  const done = status === "CONFIRMED";

  return (
    <ol className="grid grid-cols-5 gap-1.5" aria-label="Transfer progress">
      {STEPS.map((step, index) => {
        const complete = index < currentIndex || (done && index === currentIndex);
        const current = index === currentIndex && !done;
        return (
          <li key={step.id} aria-current={current ? "step" : undefined} className="min-w-0">
            <div
              className={cn(
                "h-1 rounded-full transition-colors duration-300",
                complete ? "bg-mint" : current ? (problem ? "bg-warning" : "bg-mint/60") : "bg-hairline",
              )}
            />
            <p
              className={cn(
                "mt-2 flex items-center gap-1 truncate font-mono text-[0.7rem] uppercase tracking-[0.08em] sm:text-[0.75rem]",
                complete ? "text-mint" : current ? (problem ? "text-warning" : "text-white") : "text-muted",
              )}
            >
              {complete ? <Check className="size-3 shrink-0" aria-hidden /> : null}
              {step.label}
              <span className="sr-only">{complete ? " (complete)" : current ? (problem ? " (stopped)" : " (current)") : " (upcoming)"}</span>
            </p>
          </li>
        );
      })}
    </ol>
  );
}
