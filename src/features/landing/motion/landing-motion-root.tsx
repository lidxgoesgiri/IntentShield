"use client";

import { useRef, type ReactNode } from "react";
import { useLandingMotion } from "./use-landing-motion";
import { MotionProvider, useDecorativeMotion } from "./motion-context";

/** Wraps server-rendered sections; adds optional motion without owning any content. */
export function LandingMotionRoot({ children }: { children: ReactNode }) {
  return <MotionProvider><MotionSurface>{children}</MotionSurface></MotionProvider>;
}

function MotionSurface({ children }: { children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const { enabled } = useDecorativeMotion();
  useLandingMotion(rootRef, enabled);
  return (
    <div ref={rootRef} data-landing-root="">
      {children}
    </div>
  );
}
