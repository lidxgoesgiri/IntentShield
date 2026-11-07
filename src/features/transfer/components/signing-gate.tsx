"use client";

import { Lock, PenTool, RotateCcw } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/misc";
import type { TransferStatus } from "../types";

/**
 * SigningGate states: disabled, ready, awaiting-user, rejected, sending (PRD §12).
 * The button only exists in an enabled form when every gate has passed;
 * Enter never triggers signing — only an explicit click/press of this button.
 */
export function SigningGate({
  status,
  available,
  reason,
  error,
  onSign,
  onReviewAgain,
}: {
  status: TransferStatus;
  available: boolean;
  reason: string | null;
  error: { code: string; message: string } | null;
  onSign: () => void;
  onReviewAgain: () => void;
}) {
  if (status === "AWAITING_WALLET") {
    return (
      <div className="space-y-3" role="status">
        <Button size="lg" className="w-full" disabled aria-busy="true">
          <Spinner className="text-muted" label="Waiting for your wallet…" />
        </Button>
        <p className="type-caption">
          Check the wallet popup. IntentShield will only broadcast if the wallet signs these exact reviewed bytes.
        </p>
      </div>
    );
  }

  if (status === "WALLET_REJECTED" || status === "SUBMIT_FAILED") {
    return (
      <div className="space-y-3">
        <Alert
          tone="warning"
          role="alert"
          title={status === "WALLET_REJECTED" ? "Not signed — nothing was sent" : "Not broadcast"}
          action={
            <Button variant="secondary" size="sm" onClick={onReviewAgain}>
              <RotateCcw className="size-4" aria-hidden /> Review again
            </Button>
          }
        >
          {error?.message}
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Button
        size="lg"
        className="w-full"
        disabled={!available}
        onClick={onSign}
        aria-describedby={!available && reason ? "signing-gate-reason" : undefined}
      >
        {available ? <PenTool className="size-5" aria-hidden /> : <Lock className="size-5" aria-hidden />}
        Sign with Wallet
      </Button>
      {!available && reason ? (
        <p id="signing-gate-reason" className="type-caption flex items-start gap-1.5">
          <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {reason}
        </p>
      ) : (
        <p className="type-caption">Your wallet will show its own confirmation. Nothing is signed until you approve it there.</p>
      )}
    </div>
  );
}
