"use client";

import { isAddress, isSignature } from "@solana/kit";
import { useCallback, useSyncExternalStore } from "react";

const LEGACY_STORAGE_KEY = "intentshield:last-broadcast-signature";
const STORAGE_PREFIX = "intentshield:devnet:last-broadcast-signature:";
const CHANGE_EVENT = "intentshield:transaction-recovery";

function recoveryKey(walletAddress: string | null | undefined): string | null {
  return walletAddress && isAddress(walletAddress) ? `${STORAGE_PREFIX}${walletAddress}` : null;
}

/** A public signature for this wallet only; legacy ownerless entries are never shown. */
export function readRecoverableSignature(walletAddress: string | null | undefined): string | null {
  const key = recoveryKey(walletAddress);
  if (!key) return null;
  try {
    const value = window.sessionStorage.getItem(key);
    return value && isSignature(value) ? value : null;
  } catch {
    return null;
  }
}

export function rememberTransactionSignature(walletAddress: string, signature: string): void {
  const key = recoveryKey(walletAddress);
  if (!key || !isSignature(signature)) return;
  try {
    window.sessionStorage.setItem(key, signature);
    // The old entry cannot be safely attributed to a wallet. Never migrate it.
    window.sessionStorage.removeItem(LEGACY_STORAGE_KEY);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    // Storage may be disabled. The live receipt still tracks this signature.
  }
}

/** Only remove a signature when broadcast was definitively refused. */
export function forgetTransactionSignature(walletAddress: string, signature: string): void {
  const key = recoveryKey(walletAddress);
  if (!key) return;
  try {
    if (window.sessionStorage.getItem(key) !== signature) return;
    window.sessionStorage.removeItem(key);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    // Recovery is best-effort when browser storage is unavailable.
  }
}

function subscribe(callback: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(CHANGE_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

export function useRecoverableSignature(walletAddress: string | null | undefined): string | null {
  const snapshot = useCallback(() => readRecoverableSignature(walletAddress), [walletAddress]);
  return useSyncExternalStore(subscribe, snapshot, () => null);
}
