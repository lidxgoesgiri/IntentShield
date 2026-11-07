import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * IntentShield mark — vectorised from the provided logo (shield whose lower
 * edge becomes a heart, closed by a check stroke). Gradient remapped to the
 * mandatory mint palette (PRD §11.2). Decorative unless `title` is given.
 */
export function BrandMark({ className, title }: { className?: string; title?: string }) {
  const gradientId = useId();
  return (
    <svg
      viewBox="0 0 100 100"
      className={cn("shrink-0", className)}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      <defs>
        <linearGradient id={gradientId} x1="12" y1="20" x2="90" y2="80" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#3a9e86" />
          <stop offset="0.55" stopColor="#64e8c7" />
          <stop offset="1" stopColor="#d7e2df" />
        </linearGradient>
      </defs>
      <g fill="none" stroke={`url(#${gradientId})`} strokeWidth="4.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 57 C16 46 15.5 33 17 21.5 C30 19.5 40.5 15.5 50 9 C59.5 15.5 70 19.5 83 21.5 C84 26 84.3 29.5 84.3 33.5" />
        <path d="M84.6 40 C83.6 62 71 80 50 92" />
        <path d="M84.3 36.6 C68.5 40.5 57.5 50.5 50 64 C46.5 56.5 41.5 50.5 35 50.5 C28 50.5 23.8 56 24.8 62.5 C26.6 72.5 37.5 84 50 92" />
      </g>
    </svg>
  );
}

export function BrandWordmark({ className }: { className?: string }) {
  return (
    <span className={cn("font-display text-[1.05rem] tracking-[0.18em] uppercase leading-none", className)}>
      <span className="font-medium text-white">Intent</span>
      <span className="font-bold text-mint">Shield</span>
    </span>
  );
}
