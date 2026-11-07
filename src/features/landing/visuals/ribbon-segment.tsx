import { cn } from "@/lib/utils";

/**
 * One coordinated segment of the signature energy ribbon (PRD §11.6).
 * Rendered fully drawn by default; the motion island may animate
 * `stroke-dashoffset` (pathLength=1) when motion is allowed. Decorative only.
 */
export function RibbonSegment({
  d,
  viewBox,
  className,
  strokeWidth = 2,
  name,
  preserveAspectRatio,
}: {
  d: string;
  viewBox: string;
  className?: string;
  strokeWidth?: number;
  /** Identifier the motion island uses to find this segment. */
  name: string;
  preserveAspectRatio?: string;
}) {
  return (
    <svg
      viewBox={viewBox}
      className={cn("ribbon-svg overflow-visible", className)}
      aria-hidden="true"
      focusable="false"
      preserveAspectRatio={preserveAspectRatio}
      data-ribbon={name}
    >
      <path d={d} fill="none" className="ribbon-track" strokeWidth={strokeWidth + 1.5} strokeLinecap="round" />
      <path d={d} fill="none" className="ribbon-glow" strokeWidth={strokeWidth + 3} strokeLinecap="round" pathLength={1} strokeDasharray="1" strokeDashoffset="0" data-ribbon-glow="" />
      <path d={d} fill="none" className="ribbon-path" strokeWidth={strokeWidth} strokeLinecap="round" pathLength={1} strokeDasharray="1" strokeDashoffset="0" data-ribbon-path="" />
    </svg>
  );
}
