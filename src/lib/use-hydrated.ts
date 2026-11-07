"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => undefined;

/**
 * `false` during SSR and the hydration render, `true` afterwards. Lets
 * browser-only state (wallet discovery) render identically on server and
 * client first, avoiding hydration mismatches.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
