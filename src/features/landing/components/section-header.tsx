import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type HeadlineSplit = "lines" | "words" | "chars" | "scrub";

/** Numbered editorial chapter header (PRD §11.1 "numbered chapters"). */
export function SectionHeader({
  index,
  eyebrow,
  title,
  titleId,
  lead,
  className,
  split = "lines",
  children,
}: {
  index: string;
  eyebrow: string;
  title: ReactNode;
  titleId: string;
  lead?: ReactNode;
  className?: string;
  /** How the motion layer reveals this headline (varied per section). */
  split?: HeadlineSplit;
  children?: ReactNode;
}) {
  return (
    <div className={cn("grid gap-6 lg:grid-cols-12 lg:gap-8", className)}>
      <div className="lg:col-span-8">
        <p className="type-eyebrow flex items-center gap-3">
          <span className="text-mint">{index}</span>
          <span aria-hidden className="h-px w-10 origin-left bg-hairline" data-reveal="line" />
          <span>{eyebrow}</span>
        </p>
        <h2 id={titleId} className="type-h2 mt-5 max-w-[15ch]" data-split={split}>
          {title}
        </h2>
      </div>
      {lead || children ? (
        <div className="space-y-6 self-end lg:col-span-4" data-reveal="slide">
          {lead ? <p className="type-lead">{lead}</p> : null}
          {children}
        </div>
      ) : null}
    </div>
  );
}
