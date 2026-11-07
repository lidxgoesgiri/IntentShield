"use client";

import { useCallback, useEffect, useState } from "react";
import { getRpcPort } from "@/lib/solana/client";

export type BalanceState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; lamports: bigint; checkedAt: number }
  | { status: "unavailable" };

/** Real Devnet balance from RPC only; shows `unavailable` instead of guessing. */
export function useBalance(address: string | null, refreshMs = 20_000) {
  const [state, setState] = useState<BalanceState>({ status: "idle" });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!address) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | null = null;

    const load = async () => {
      try {
        const lamports = await getRpcPort().getBalance(address, controller.signal);
        if (!controller.signal.aborted) setState({ status: "ok", lamports, checkedAt: Date.now() });
      } catch {
        if (!controller.signal.aborted) setState({ status: "unavailable" });
      }
      if (!controller.signal.aborted) timer = setTimeout(load, refreshMs);
    };
    void load();
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [address, nonce, refreshMs]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  return { balance: address ? state : ({ status: "idle" } as const), refresh };
}
