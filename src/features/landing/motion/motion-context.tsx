"use client";

import { createContext, useContext, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { MOTION_CONDITIONS } from "./motion-preferences";

function subscribePreference(notify: () => void) {
  const media = window.matchMedia(MOTION_CONDITIONS.motion);
  media.addEventListener("change", notify);
  return () => media.removeEventListener("change", notify);
}

type MotionState = { enabled: boolean; paused: boolean; togglePaused: () => void };
const MotionContext = createContext<MotionState>({ enabled: false, paused: false, togglePaused: () => undefined });

/** One presentation preference governs every landing engine; transaction state is never involved. */
export function MotionProvider({ children }: { children: ReactNode }) {
  const allowed = useSyncExternalStore(subscribePreference, () => window.matchMedia(MOTION_CONDITIONS.motion).matches, () => false);
  const [paused, setPaused] = useState(false);
  const value = useMemo(() => ({ enabled: allowed && !paused, paused, togglePaused: () => setPaused((current) => !current) }), [allowed, paused]);
  return <MotionContext.Provider value={value}>{children}</MotionContext.Provider>;
}

export function useDecorativeMotion() {
  return useContext(MotionContext);
}
