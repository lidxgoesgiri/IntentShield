"use client";

import { useCallback, useEffect, useState } from "react";
import { getRpcPort } from "@/lib/solana/client";

export type BalanceState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; lamports: bigint; checkedAt: number }
  | { status: "unavailable" };

/** Real Devnet balance from RPC only; shows `unavailable` instead of guessing. */
export function useBalance(address: string | null, refreshMs = 20_000, enabled = true) {
  const [snapshot, setSnapshot] = useState<{ address: string; nonce: number; balance: BalanceState } | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!address || !enabled) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let inFlight = false;

    const load = async () => {
      if (document.hidden || inFlight) return;
      timer = null;
      inFlight = true;
      try {
        const lamports = await getRpcPort().getBalance(address, controller.signal);
        if (!controller.signal.aborted) setSnapshot({ address, nonce, balance: { status: "ok", lamports, checkedAt: Date.now() } });
      } catch {
        if (!controller.signal.aborted) setSnapshot({ address, nonce, balance: { status: "unavailable" } });
      }
      inFlight = false;
      if (!controller.signal.aborted && !document.hidden) timer = setTimeout(load, refreshMs);
    };
    const onVisibility = () => {
      if (document.hidden) {
        if (timer) clearTimeout(timer);
        timer = null;
      } else if (!timer) void load();
    };
    document.addEventListener("visibilitychange", onVisibility);
    void load();
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [address, nonce, refreshMs, enabled]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  const balance: BalanceState = !address || !enabled ? { status: "idle" }
    : snapshot?.address === address && snapshot.nonce === nonce ? snapshot.balance
      : { status: "loading" };
  return { balance, refresh };
}
