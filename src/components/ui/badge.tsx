import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "mint" | "warning" | "danger" | "demo";

const TONES: Record<Tone, string> = {
  neutral: "border-hairline bg-raised/60 text-silver",
  mint: "border-mint/35 bg-mint/10 text-mint",
  warning: "border-warning/40 bg-warning/10 text-warning",
  danger: "border-danger/40 bg-danger/10 text-danger",
  // Demo provenance must never be confused with network state.
  demo: "border-silver/30 bg-transparent text-silver border-dashed",
};

export function Badge({
  tone = "neutral",
  icon,
  children,
  className,
}: {
  tone?: Tone;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[0.8125rem] font-medium uppercase leading-none tracking-[0.08em]",
        TONES[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}
