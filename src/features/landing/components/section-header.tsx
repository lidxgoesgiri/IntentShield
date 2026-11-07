import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Numbered editorial chapter header (PRD §11.1 "numbered chapters"). */
export function SectionHeader({
  index,
  eyebrow,
  title,
  titleId,
  lead,
  className,
  children,
}: {
  index: string;
  eyebrow: string;
  title: ReactNode;
  titleId: string;
  lead?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={cn("grid gap-8 lg:grid-cols-12", className)} data-reveal="">
      <div className="space-y-6 lg:col-span-8">
        <p className="type-eyebrow flex items-center gap-3">
          <span className="text-mint">{index}</span>
          <span aria-hidden className="h-px w-10 bg-hairline" />
          <span>{eyebrow}</span>
        </p>
        <h2 id={titleId} className="type-h2 max-w-[18ch]">
          {title}
        </h2>
      </div>
      {lead || children ? (
        <div className="space-y-6 self-end lg:col-span-4">
          {lead ? <p className="type-lead">{lead}</p> : null}
          {children}
        </div>
      ) : null}
    </div>
  );
}
