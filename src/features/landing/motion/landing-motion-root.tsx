"use client";

import { useRef, type ReactNode } from "react";
import { useLandingMotion } from "./use-landing-motion";

/** Wraps server-rendered sections; adds optional motion without owning any content. */
export function LandingMotionRoot({ children }: { children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);
  useLandingMotion(rootRef);
  return (
    <div ref={rootRef} data-landing-root="">
      {children}
    </div>
  );
}
