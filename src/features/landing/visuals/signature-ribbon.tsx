"use client";

import { useEffect, useId, useMemo, useRef } from "react";
import { cn } from "@/lib/utils";
import { MOTION_CONDITIONS } from "../motion/motion-preferences";
import {
  centerlinePath,
  HERO_RIBBON_COMPACT_SPEC,
  HERO_RIBBON_SPEC,
  strandPaths,
  type RibbonSpec,
  type Vec,
} from "./ribbon-geometry";

const VARIANTS = {
  hero: { spec: HERO_RIBBON_SPEC, viewBox: "0 0 1440 960", width: 1440 },
  compact: { spec: HERO_RIBBON_COMPACT_SPEC, viewBox: "0 0 600 600", width: 600 },
} as const satisfies Record<string, { spec: RibbonSpec; viewBox: string; width: number }>;

export type SignatureRibbonVariant = keyof typeof VARIANTS;

/** Opacity per strand: the outer pair reads as the lit edges of the band. */
function strandOpacity(index: number, count: number): number {
  if (index === 0 || index === count - 1) return 0.95;
  const middle = (count - 1) / 2;
  const distance = Math.abs(index - middle) / middle;
  return 0.16 + 0.22 * distance;
}

/**
 * IntentShield's signature energy ribbon — a twisting band of light strands.
 * Decorative only (aria-hidden, no pointer events). The static frame is
 * server-rendered, so it shows without JavaScript and under reduced motion;
 * when motion is allowed the band flows, follows scroll and leans away from
 * the cursor. Animation pauses offscreen and in hidden tabs.
 */
export function SignatureRibbon({ variant, className }: { variant: SignatureRibbonVariant; className?: string }) {
  const { spec, viewBox, width } = VARIANTS[variant];
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const gradientId = `${uid}-ribbon-gradient`;
  const strands = useMemo(() => strandPaths(spec, { time: 0 }), [spec]);
  const pulse = useMemo(() => centerlinePath(spec, { time: 0 }), [spec]);

  const svgRef = useRef<SVGSVGElement>(null);
  const strandRefs = useRef<(SVGPathElement | null)[]>([]);
  const glowRefs = useRef<(SVGPathElement | null)[]>([]);
  const pulseRef = useRef<SVGPathElement>(null);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || typeof window === "undefined") return;
    if (!window.matchMedia(MOTION_CONDITIONS.motion).matches) return;

    const compact = variant === "compact" || !window.matchMedia(MOTION_CONDITIONS.desktop).matches;
    const minFrameMs = compact ? 33 : 0;
    const section = svg.closest("section") ?? svg;
    let raf = 0;
    let visible = true;
    let lastFrame = 0;
    const start = performance.now();
    let target: Vec | null = null;
    let cursor: Vec | null = null;

    const frame = (now: number) => {
      raf = 0;
      if (!visible || document.hidden) return;
      if (now - lastFrame >= minFrameMs) {
        lastFrame = now;
        const time = (now - start) / 1000;
        const rect = section.getBoundingClientRect();
        const progress = Math.min(1, Math.max(0, -rect.top / Math.max(1, rect.height)));
        if (target) {
          cursor = cursor ? { x: cursor.x + (target.x - cursor.x) * 0.08, y: cursor.y + (target.y - cursor.y) * 0.08 } : target;
        } else {
          cursor = null;
        }
        const input = { time, flow: progress * 2.4, cursor };
        const paths = strandPaths(spec, input);
        for (let i = 0; i < paths.length; i += 1) {
          strandRefs.current[i]?.setAttribute("d", paths[i]!);
          glowRefs.current[i]?.setAttribute("d", paths[i]!);
        }
        pulseRef.current?.setAttribute("d", centerlinePath(spec, input));
        svg.style.setProperty("--ribbon-drift", `${(progress * 90).toFixed(1)}px`);
      }
      raf = requestAnimationFrame(frame);
    };

    const schedule = () => {
      if (!raf && visible && !document.hidden) raf = requestAnimationFrame(frame);
    };

    const observer = new IntersectionObserver((entries) => {
      visible = entries.some((entry) => entry.isIntersecting);
      schedule();
    });
    observer.observe(svg);

    const onVisibility = () => schedule();
    document.addEventListener("visibilitychange", onVisibility);

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      const matrix = svg.getScreenCTM();
      if (!matrix) return;
      const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
      target = { x: point.x, y: point.y };
    };
    const onPointerLeave = () => {
      target = null;
    };
    if (!compact) {
      window.addEventListener("pointermove", onPointerMove, { passive: true });
      document.documentElement.addEventListener("pointerleave", onPointerLeave);
    }

    schedule();
    return () => {
      if (raf) cancelAnimationFrame(raf);
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pointermove", onPointerMove);
      document.documentElement.removeEventListener("pointerleave", onPointerLeave);
    };
  }, [spec, variant]);

  const edgeIndexes = [0, strands.length - 1];

  return (
    <svg
      ref={svgRef}
      viewBox={viewBox}
      preserveAspectRatio="xMidYMid slice"
      className={cn("ribbon-svg signature-ribbon", className)}
      aria-hidden="true"
      focusable="false"
      data-ribbon={`signature-${variant}`}
    >
      <defs>
        <linearGradient id={gradientId} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={width} y2="0">
          <stop offset="0" stopColor="#64e8c7" stopOpacity="0" />
          <stop offset="0.18" stopColor="#64e8c7" stopOpacity="0.55" />
          <stop offset="0.5" stopColor="#bafbea" stopOpacity="1" />
          <stop offset="0.78" stopColor="#64e8c7" stopOpacity="0.7" />
          <stop offset="1" stopColor="#2fa98a" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g className="signature-ribbon-body">
        {/* Soft light: wide, faint copies of the two edges (no blur filters, cheap to repaint). */}
        <g className="signature-ribbon-glow" stroke={`url(#${gradientId})`} fill="none" strokeLinecap="round">
          {strands.map((d, index) =>
            edgeIndexes.includes(index) ? (
              <path
                key={`glow-${index}`}
                ref={(node) => {
                  glowRefs.current[index] = node;
                }}
                d={d}
                strokeWidth={variant === "hero" ? 14 : 9}
                strokeOpacity={0.07}
              />
            ) : null,
          )}
        </g>
        <g stroke={`url(#${gradientId})`} fill="none" strokeLinecap="round" strokeLinejoin="round">
          {strands.map((d, index) => (
            <path
              key={index}
              ref={(node) => {
                strandRefs.current[index] = node;
              }}
              d={d}
              strokeWidth={edgeIndexes.includes(index) ? (variant === "hero" ? 1.7 : 1.4) : 0.8}
              strokeOpacity={strandOpacity(index, strands.length)}
            />
          ))}
        </g>
        <path
          ref={pulseRef}
          className="signature-ribbon-pulse"
          d={pulse}
          fill="none"
          stroke="#e9fff8"
          strokeWidth={variant === "hero" ? 2.4 : 2}
          strokeLinecap="round"
          pathLength={1}
        />
      </g>
    </svg>
  );
}
