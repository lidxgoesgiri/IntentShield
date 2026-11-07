"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { RailDirection } from "./rail-config";

/** What the rail driver needs from a track; positions are written straight to `strip`. */
export type MarqueeTrackController = Readonly<{
  direction: RailDirection;
  speedKey: "upperSpeed" | "lowerSpeed";
  /** Clipping viewport; also the hover target. */
  viewport: HTMLElement;
  /** The element that moves (one transform for the whole track). */
  strip: HTMLElement;
  /** The first copy: its width is the exact wrap distance. */
  sequence: HTMLElement;
  setCopies: (count: number) => void;
}>;

/**
 * One infinite track: a strip of identical copies of `children` (list items).
 * Only the first copy is exposed to assistive tech; the duplicates are
 * aria-hidden and inert. Each item carries its own trailing spacing, so a
 * copy's width is exactly the distance after which the loop repeats.
 * Without JavaScript (or with reduced motion) the track is simply static.
 */
export function InfiniteMarqueeTrack({
  direction,
  speedKey,
  label,
  className,
  sequenceClassName,
  onController,
  children,
}: {
  direction: RailDirection;
  speedKey: MarqueeTrackController["speedKey"];
  /** Accessible name of the list. */
  label: string;
  className?: string;
  sequenceClassName?: string;
  onController: (controller: MarqueeTrackController | null) => void;
  children: ReactNode;
}) {
  const [copies, setCopies] = useState(2);
  const viewportRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const sequenceRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const viewport = viewportRef.current;
    const strip = stripRef.current;
    const sequence = sequenceRef.current;
    if (!viewport || !strip || !sequence) return;
    onController({ direction, speedKey, viewport, strip, sequence, setCopies });
    return () => onController(null);
  }, [direction, speedKey, onController]);

  return (
    <div ref={viewportRef} className={cn("rail-viewport", className)} data-rail-track={direction}>
      <div ref={stripRef} className="rail-strip" data-direction={direction}>
        <ul ref={sequenceRef} className={cn("rail-sequence", sequenceClassName)} aria-label={label}>
          {children}
        </ul>
        {Array.from({ length: copies - 1 }, (_, index) => (
          <ul key={index} className={cn("rail-sequence", sequenceClassName)} aria-hidden="true" inert data-rail-copy="">
            {children}
          </ul>
        ))}
      </div>
    </div>
  );
}
