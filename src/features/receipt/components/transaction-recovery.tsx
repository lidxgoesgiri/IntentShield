"use client";

import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { useRecoverableSignature } from "../lib/transaction-recovery";

/** Reloads and route failures can recover status without creating another transfer. */
export function TransactionRecovery({ currentSignature }: { currentSignature?: string | null }) {
  const signature = useRecoverableSignature();
  if (!signature || signature === currentSignature) return null;
  return (
    <Alert tone="info" title="A recent transaction is available">
      <p>A previous send attempt has a recorded signature. Check its status before sending the same transfer again.</p>
      <Link href={`/tx/${signature}`} className="mt-2 inline-flex min-h-11 items-center text-white underline decoration-mint/60 underline-offset-4">
        Recover transaction receipt
      </Link>
    </Alert>
  );
}
