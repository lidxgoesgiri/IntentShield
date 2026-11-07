"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { publicConfig } from "@/config/env";
import type { VerificationContext } from "@/features/verification/types";
import { getRpcPort } from "@/lib/solana/client";
import { checkDevnet } from "@/lib/solana/network";
import { getWalletClient, type WalletClient } from "./wallet-client";

export type DevnetStatus =
  | { state: "checking" }
  | { state: "verified"; context: VerificationContext }
  | { state: "wrong-network"; message: string }
  | { state: "unavailable"; message: string }
  | { state: "misconfigured"; message: string };

type ProductContextValue = {
  walletClient: WalletClient;
  devnet: DevnetStatus;
  recheckDevnet: () => void;
  online: boolean;
};

const ProductContext = createContext<ProductContextValue | null>(null);

function subscribeOnline(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

/** Product-only providers: wallet client, verified-network status, online status. */
export function ProductProvider({ children }: { children: ReactNode }) {
  const [walletClient] = useState(getWalletClient);
  const [devnet, setDevnet] = useState<DevnetStatus>(() =>
    publicConfig.configError
      ? { state: "misconfigured", message: `Invalid configuration: ${publicConfig.configError}` }
      : { state: "checking" },
  );
  const [checkNonce, setCheckNonce] = useState(0);
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);

  useEffect(() => {
    if (publicConfig.configError || !online) return;
    const controller = new AbortController();
    checkDevnet(getRpcPort(), controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      if (result.ok) setDevnet({ state: "verified", context: result.context });
      else if (result.reason === "WRONG_CLUSTER") setDevnet({ state: "wrong-network", message: result.message });
      else setDevnet({ state: "unavailable", message: result.message });
    });
    return () => controller.abort();
  }, [checkNonce, online]);

  const recheckDevnet = useCallback(() => {
    setDevnet((current) => (current.state === "misconfigured" ? current : { state: "checking" }));
    setCheckNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    window.addEventListener("online", recheckDevnet);
    return () => window.removeEventListener("online", recheckDevnet);
  }, [recheckDevnet]);

  const value = useMemo(() => ({ walletClient, devnet, recheckDevnet, online }), [walletClient, devnet, recheckDevnet, online]);
  return <ProductContext.Provider value={value}>{children}</ProductContext.Provider>;
}

export function useProductContext(): ProductContextValue {
  const value = useContext(ProductContext);
  if (!value) throw new Error("useProductContext must be used inside <ProductProvider>.");
  return value;
}
