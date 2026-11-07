"use client";

import {
  useConnectedWallet as useKitConnectedWallet,
  useIsWalletReady,
  useWalletStatus,
} from "@solana/kit-plugin-wallet/react";
import { useMemo } from "react";
import { SUPPORTED_CHAIN } from "@/config/product";
import { useHydrated } from "@/lib/use-hydrated";
import type { TransactionSignerPort } from "@/features/transfer/lib/sign-transfer";
import type { TransferMessageVersion } from "@/features/transfer/lib/build-transfer";
import { useProductContext } from "../product-context";

export type ConnectedWalletInfo = Readonly<{
  status: ReturnType<typeof useWalletStatus>;
  ready: boolean;
  address: string | null;
  walletName: string | null;
  walletIcon: string | null;
  /** Account advertises solana:devnet. */
  supportsDevnet: boolean;
  /** Wallet exposes solana:signTransaction (sign without broadcasting). */
  signer: TransactionSignerPort | null;
  messageVersion: TransferMessageVersion | null;
}>;

function hasModifyingSigner(signer: unknown): signer is TransactionSignerPort {
  return (
    typeof signer === "object" &&
    signer !== null &&
    typeof (signer as { modifyAndSignTransactions?: unknown }).modifyAndSignTransactions === "function"
  );
}

/** Real wallet state (Wallet Standard) narrowed to what IntentShield needs. */
export function useConnectedWallet(): ConnectedWalletInfo {
  const { walletClient } = useProductContext();
  const hydrated = useHydrated();
  const liveStatus = useWalletStatus(walletClient);
  const liveReady = useIsWalletReady(walletClient);
  const liveConnected = useKitConnectedWallet(walletClient);
  // Until hydration completes, render the same "pending" snapshot as the server.
  const status = hydrated ? liveStatus : "pending";
  const ready = hydrated ? liveReady : false;
  const connected = hydrated ? liveConnected : null;

  return useMemo(() => {
    if (!connected) {
      return {
        status,
        ready,
        address: null,
        walletName: null,
        walletIcon: null,
        supportsDevnet: false,
        signer: null,
        messageVersion: null,
      };
    }
    const versions = connected.supportedTransactionVersions;
    return {
      status,
      ready,
      address: connected.account.address,
      walletName: connected.wallet.name,
      walletIcon: connected.wallet.icon ?? null,
      supportsDevnet: connected.account.chains.includes(SUPPORTED_CHAIN),
      signer: hasModifyingSigner(connected.signer) ? connected.signer : null,
      messageVersion: versions.has(0) ? 0 : versions.has("legacy") ? "legacy" : null,
    };
  }, [connected, ready, status]);
}
