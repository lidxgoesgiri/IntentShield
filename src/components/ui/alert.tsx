import { CircleCheck, CircleX, Info, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Tone = "info" | "success" | "warning" | "danger";

const STYLES: Record<Tone, { box: string; icon: ReactNode; label: string }> = {
  info: { box: "border-hairline bg-raised/50", icon: <Info className="size-5 text-silver" aria-hidden />, label: "Info" },
  success: {
    box: "border-mint/40 bg-mint/[0.07]",
    icon: <CircleCheck className="size-5 text-mint" aria-hidden />,
    label: "Passed",
  },
  warning: {
    box: "border-warning/45 bg-warning/[0.08]",
    icon: <TriangleAlert className="size-5 text-warning" aria-hidden />,
    label: "Warning",
  },
  danger: {
    box: "border-danger/45 bg-danger/[0.08]",
    icon: <CircleX className="size-5 text-danger" aria-hidden />,
    label: "Blocked",
  },
};

/**
 * Inline, persistent alert (security blockers are never toasts — PRD §12).
 * Status is always conveyed by text + icon, never by color alone.
 */
export function Alert({
  tone = "info",
  title,
  children,
  role,
  className,
  action,
}: {
  tone?: Tone;
  title: ReactNode;
  children?: ReactNode;
  /** Use "alert" only for blockers that must interrupt assistive tech. */
  role?: "alert" | "status";
  className?: string;
  action?: ReactNode;
}) {
  const style = STYLES[tone];
  return (
    <div role={role} className={cn("flex gap-3 rounded-[var(--radius-control)] border p-4", style.box, className)}>
      <span className="mt-0.5">{style.icon}</span>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="font-medium text-white">
          <span className="sr-only">{style.label}: </span>
          {title}
        </p>
        {children ? <div className="text-[0.925rem] leading-relaxed text-silver">{children}</div> : null}
        {action ? <div className="pt-2">{action}</div> : null}
      </div>
    </div>
  );
}
