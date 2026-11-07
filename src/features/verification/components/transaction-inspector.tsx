"use client";

import { Fingerprint } from "lucide-react";
import { Disclosure } from "@/components/ui/misc";
import { bytesToBase64, bytesToHex } from "@/lib/format/bytes";
import { shortFingerprint } from "../lib/fingerprint-message";
import type { VerificationResult } from "../types";
import { ComparisonRowView } from "./comparison-row";
import { VerificationStatus } from "./verification-status";

/**
 * Pre-sign inspector (PRD §10.3, FR-007): every row is computed from the
 * decoded message that will be signed — never from form values.
 */
export function TransactionInspector({ result, messageBytes }: { result: VerificationResult; messageBytes: Uint8Array | null }) {
  return (
    <section aria-labelledby="inspector-heading" className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 id="inspector-heading" className="font-display text-lg font-semibold text-white">
          Pre-sign inspection
        </h3>
        <p className="type-caption flex items-center gap-1.5" title={result.messageFingerprint}>
          <Fingerprint className="size-3.5" aria-hidden />
          <span className="sr-only">Message fingerprint:</span>
          <span className="font-mono">{shortFingerprint(result.messageFingerprint)}</span>
        </p>
      </div>

      <VerificationStatus result={result} />

      {result.comparisons.length > 0 ? (
        <div role="table" aria-label="Approved intent compared with the decoded transaction" className="overflow-hidden rounded-[var(--radius-control)] border border-hairline bg-obsidian/40">
          <div role="rowgroup" className="hidden border-b border-hairline bg-raised/40 px-4 py-2.5 md:block">
            <div role="row" className="grid grid-cols-[7.5rem_1fr_1fr_7.5rem] gap-x-4">
              <span role="columnheader" className="type-eyebrow text-[0.7rem]">Field</span>
              <span role="columnheader" className="type-eyebrow text-[0.7rem]">You intended</span>
              <span role="columnheader" className="type-eyebrow text-[0.7rem]">Transaction will execute</span>
              <span role="columnheader" className="type-eyebrow text-[0.7rem]">State</span>
            </div>
          </div>
          <div role="rowgroup">
            {result.comparisons.map((row) => (
              <ComparisonRowView key={row.field} row={row} />
            ))}
          </div>
        </div>
      ) : null}

      <p className="type-caption">
        Checks cover this native SOL transfer only. They do not establish recipient trustworthiness.
      </p>

      {messageBytes ? (
        <Disclosure summary="Advanced: exact message bytes">
          <dl className="space-y-3 text-[0.85rem]">
            <div>
              <dt className="type-caption">Format</dt>
              <dd className="font-data text-silver">
                {result.message ? `${result.message.version === "legacy" ? "legacy" : `v${result.message.version}`} · ${result.message.instructionCount} instruction(s) · ${result.message.staticAccountCount} accounts · ${messageBytes.length} bytes` : "—"}
              </dd>
            </div>
            <div>
              <dt className="type-caption">Recent blockhash</dt>
              <dd className="font-data text-silver">{result.message?.lifetimeToken ?? "—"}</dd>
            </div>
            <div>
              <dt className="type-caption">Fingerprint (local integrity marker, not a signing authority)</dt>
              <dd className="font-data text-silver">{result.messageFingerprint}</dd>
            </div>
            <div>
              <dt className="type-caption">Message (base64)</dt>
              <dd className="font-data max-h-32 overflow-auto text-silver">{bytesToBase64(messageBytes)}</dd>
            </div>
            <div>
              <dt className="type-caption">Message (hex)</dt>
              <dd className="font-data max-h-32 overflow-auto text-muted">{bytesToHex(messageBytes)}</dd>
            </div>
          </dl>
        </Disclosure>
      ) : null}
    </section>
  );
}
