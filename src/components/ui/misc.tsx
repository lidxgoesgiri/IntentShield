import { LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Indeterminate spinner for real in-flight work (never a fake percentage). */
export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <LoaderCircle className={cn("spin size-4 text-mint", className)} aria-hidden />
      {label ? <span>{label}</span> : null}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden className={cn("block animate-pulse rounded-md bg-raised", className)} />;
}

/** Native disclosure (works without JS, keyboard accessible). */
export function Disclosure({
  summary,
  children,
  className,
  defaultOpen,
}: {
  summary: ReactNode;
  children: ReactNode;
  className?: string;
  defaultOpen?: boolean;
}) {
  return (
    <details className={cn("group rounded-[var(--radius-control)] border border-hairline", className)} open={defaultOpen}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2.5 text-[0.9rem] font-medium text-silver hover:text-white [&::-webkit-details-marker]:hidden">
        {summary}
        <span aria-hidden className="font-mono text-muted transition-transform group-open:rotate-45">
          +
        </span>
      </summary>
      <div className="border-t border-hairline px-4 py-3">{children}</div>
    </details>
  );
}

export function SectionLabel({ index, children }: { index?: string; children: ReactNode }) {
  return (
    <p className="type-eyebrow flex items-center gap-3">
      {index ? <span className="text-mint">{index}</span> : null}
      <span>{children}</span>
    </p>
  );
}
