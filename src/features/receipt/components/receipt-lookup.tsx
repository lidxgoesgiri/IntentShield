"use client";

import { RefreshCw, SearchX } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/misc";
import { getRpcPort } from "@/lib/solana/client";
import { explorerTransactionUrl } from "../lib/explorer-url";
import { loadReceipt, type ReceiptLookup as Lookup } from "../lib/load-receipt";
import { ReceiptCard } from "./receipt-card";

const POLL_MS = 3_000;
const MAX_POLLS = 20;

/** Client-side RPC lookup for /tx/[signature] (PRD §10.5). */
export function ReceiptLookup({ signature }: { signature: string }) {
  const [snapshot, setSnapshot] = useState<{ signature: string; lookup: Lookup; ended: boolean } | null>(null);
  const [nonce, setNonce] = useState(0);
  const lookup = snapshot?.signature === signature ? snapshot.lookup : null;
  const ended = snapshot?.signature === signature && snapshot.ended;
  const retry = () => { setSnapshot(null); setNonce((n) => n + 1); };

  useEffect(() => {
    const controller = new AbortController();
    let polls = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const run = async () => {
      try {
        const result = await loadReceipt(getRpcPort(), signature, controller.signal);
        if (controller.signal.aborted) return;
        polls += 1;
        const settled = result.kind === "found" && result.feeLamports !== null && (result.status === "onchain_failed" || result.confirmationStatus === "finalized");
        const keepPolling = !settled && result.kind !== "unavailable" && polls < MAX_POLLS;
        setSnapshot({ signature, lookup: result, ended: !keepPolling && !settled });
        if (keepPolling) timer = setTimeout(run, POLL_MS);
      } catch {
        /* aborted */
      }
    };
    void run();
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [signature, nonce]);

  const explorer = explorerTransactionUrl(signature);

  if (!lookup) {
    return (
      <p role="status" className="text-silver">
        <Spinner label="Looking up this signature on Solana Devnet…" />
      </p>
    );
  }

  if (lookup.kind === "unavailable") {
    return (
      <Alert
        tone="warning"
        role="alert"
        title="Status unavailable"
        action={
          <Button variant="secondary" size="sm" onClick={retry}>
            <RefreshCw className="size-4" aria-hidden /> Retry
          </Button>
        }
      >
        {lookup.message} No result is shown rather than a guessed one.
      </Alert>
    );
  }

  if (lookup.kind === "not_found") {
    return (
      <div className="space-y-4">
        <Alert tone={ended ? "warning" : "info"} role="status" title={ended ? "Status unknown — automatic checks paused" : "Not found on Solana Devnet (yet)"}>
          <span className="inline-flex items-start gap-2">
            <SearchX className="mt-0.5 size-4 shrink-0" aria-hidden />
            The RPC has no record of this signature. If it was just submitted it may still appear; otherwise it may have expired
            or belong to another cluster.
          </span>
        </Alert>
        <Button variant="secondary" size="sm" onClick={retry}><RefreshCw className="size-4" aria-hidden /> Check again</Button>
        {explorer ? (
          <a href={explorer} target="_blank" rel="noopener noreferrer" className="text-white underline decoration-mint/60 underline-offset-[6px]">
            Check Solana Explorer (Devnet)<span className="sr-only"> (opens in a new tab)</span>
          </a>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ReceiptCard
        showPermalink={false}
        data={{
          status: ended && lookup.status === "confirming" ? "unknown" : lookup.status,
          signature,
          amountLamports: lookup.transfer?.amountLamports ?? null,
          sender: lookup.transfer?.sender ?? null,
          recipient: lookup.transfer?.recipient ?? null,
          feeLamports: lookup.feeLamports,
          blockTime: lookup.blockTime,
          slot: lookup.slot,
          confirmationStatus: lookup.confirmationStatus,
          error: lookup.error,
        }}
      />
      {ended ? (
        <Alert tone={lookup.status === "confirmed" ? "info" : "warning"} title={lookup.status === "confirmed" ? "Confirmed — automatic finality checks paused" : lookup.status === "onchain_failed" ? "Failed on chain — receipt details unavailable" : "Confirmation unknown — automatic checks paused"}>
          <p>{lookup.status === "confirmed" ? "Confirmation was observed. Finality or complete receipt details have not been observed yet." : lookup.status === "onchain_failed" ? "The network reported a transaction error. The actual charged fee is not available yet; check again for complete receipt details." : "The checking period ended without confirmation. This does not prove the transaction failed. Check its signature before sending again."}</p>
          <Button variant="secondary" size="sm" className="mt-3" onClick={retry}><RefreshCw className="size-4" aria-hidden /> Check again</Button>
        </Alert>
      ) : null}
      {!lookup.transfer && lookup.feeLamports !== null && lookup.status !== "confirming" ? (
        <Alert tone="info" title="Not a single native SOL transfer">
          This transaction is not a single System Program transfer in the layout IntentShield builds, so IntentShield shows only its status.
        </Alert>
      ) : null}
      <p className="type-caption">
        Want to send one yourself?{" "}
        <Link href="/app" className="text-white underline decoration-mint/60 underline-offset-4">
          Open the workspace
        </Link>
        .
      </p>
    </div>
  );
}
