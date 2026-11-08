"use client";

import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { MOTION_CONDITIONS } from "./motion-preferences";

function subscribePreference(notify: () => void) {
  const media = window.matchMedia(MOTION_CONDITIONS.motion);
  media.addEventListener("change", notify);
  return () => media.removeEventListener("change", notify);
}

type MotionState = { enabled: boolean };
const MotionContext = createContext<MotionState>({ enabled: false });

/** The reduced-motion preference governs every landing engine; transaction state is never involved. */
export function MotionProvider({ children }: { children: ReactNode }) {
  const enabled = useSyncExternalStore(subscribePreference, () => window.matchMedia(MOTION_CONDITIONS.motion).matches, () => false);
  const value = useMemo(() => ({ enabled }), [enabled]);
  return <MotionContext.Provider value={value}>{children}</MotionContext.Provider>;
}

export function useDecorativeMotion() {
  return useContext(MotionContext);
}
