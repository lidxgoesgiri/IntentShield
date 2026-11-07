import { CircleCheck, CircleDashed, CircleX, CloudOff, LoaderCircle, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DemoResult } from "../simulator/types";

const VIEW: Record<DemoResult["status"], { label: string; copy: string; className: string; icon: React.ReactNode }> = {
  idle: {
    label: "Idle",
    copy: "Choose a sample transaction and run a check.",
    className: "border-hairline text-silver",
    icon: <CircleDashed className="size-5 text-muted" aria-hidden />,
  },
  loading: {
    label: "Checking",
    copy: "Checking sample transaction fields…",
    className: "border-hairline text-silver",
    icon: <LoaderCircle className="spin size-5 text-mint" aria-hidden />,
  },
  success: {
    label: "Matched in demo",
    copy: "Demo: supported transaction fields match the sample intent.",
    className: "border-mint/50 bg-mint/[0.06] text-mint",
    icon: <CircleCheck className="size-5" aria-hidden />,
  },
  warning: {
    label: "Mismatch — would block",
    copy: "Demo: transaction differs from the sample intent. Signing would be blocked.",
    className: "border-warning/50 bg-warning/[0.07] text-warning",
    icon: <TriangleAlert className="size-5" aria-hidden />,
  },
  failed: {
    label: "Check failed",
    copy: "Demo check could not complete. No security conclusion was produced.",
    className: "border-danger/50 bg-danger/[0.07] text-danger",
    icon: <CircleX className="size-5" aria-hidden />,
  },
  unavailable: {
    label: "Unavailable",
    copy: "Demo verification is currently unavailable. Try again later.",
    className: "border-hairline bg-raised/40 text-silver",
    icon: <CloudOff className="size-5" aria-hidden />,
  },
};

/** Six demo states, announced with descriptive text — never color alone (PRD §28.2, LP-18). */
export function SimulatorStatus({ result }: { result: DemoResult }) {
  const view = VIEW[result.status];
  const message = result.status === "failed" || result.status === "unavailable" ? result.message : view.copy;
  return (
    <div
      className={cn("flex items-start gap-3 rounded-[var(--radius-control)] border px-4 py-3.5", view.className)}
      data-demo-status={result.status}
    >
      <span className="mt-0.5">{view.icon}</span>
      <div className="min-w-0 space-y-0.5">
        <p className="font-mono text-[0.75rem] font-medium uppercase tracking-[0.1em]">{view.label}</p>
        <p className="text-[0.95rem] text-white">{message}</p>
        {result.status === "unavailable" && result.detail ? <p className="text-[0.875rem] text-silver">{result.detail}</p> : null}
      </div>
    </div>
  );
}

export function statusAnnouncement(result: DemoResult): string {
  const view = VIEW[result.status];
  const message = result.status === "failed" || result.status === "unavailable" ? result.message : view.copy;
  return `${view.label}. ${message}`;
}
