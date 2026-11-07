"use client";

import { isSignature } from "@solana/kit";
import { useSyncExternalStore } from "react";

const STORAGE_KEY = "intentshield:last-broadcast-signature";
const CHANGE_EVENT = "intentshield:transaction-recovery";

/** A public signature only: never retain a wallet key, signed wire payload or approval. */
export function readRecoverableSignature(): string | null {
  try {
    const value = window.sessionStorage.getItem(STORAGE_KEY);
    return value && isSignature(value) ? value : null;
  } catch {
    return null;
  }
}

export function rememberTransactionSignature(signature: string): void {
  if (!isSignature(signature)) return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, signature);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    // Storage may be disabled. The live receipt still tracks this signature.
  }
}

/** Only remove a signature when broadcast was definitively refused. */
export function forgetTransactionSignature(signature: string): void {
  try {
    if (window.sessionStorage.getItem(STORAGE_KEY) !== signature) return;
    window.sessionStorage.removeItem(STORAGE_KEY);
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

export function useRecoverableSignature(): string | null {
  return useSyncExternalStore(subscribe, readRecoverableSignature, () => null);
}
