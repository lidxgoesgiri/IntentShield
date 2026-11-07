import { isSignature } from "@solana/kit";
import { EXPLORER_BASE_URL } from "@/config/product";

/** Explorer deep link; always pinned to Devnet (PRD §10.5). Returns null for invalid input. */
export function explorerTransactionUrl(signature: string): string | null {
  if (!isSignature(signature)) return null;
  return `${EXPLORER_BASE_URL}/tx/${signature}?cluster=devnet`;
}

export function explorerAddressUrl(address: string): string {
  return `${EXPLORER_BASE_URL}/address/${encodeURIComponent(address)}?cluster=devnet`;
}
