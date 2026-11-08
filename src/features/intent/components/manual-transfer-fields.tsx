"use client";

import { Badge } from "@/components/ui/badge";
import { describedBy, Field, Input, Textarea } from "@/components/ui/field";
import { MAX_DEMO_SOL } from "@/config/product";
import type { DraftFieldErrors } from "../lib/intent-validation";

/**
 * Amount + recipient are always visible and editable before approval
 * (PRD FR-002/FR-003). Values stay strings; conversion happens via BigInt.
 */
export function ManualTransferFields({
  amountSol,
  recipient,
  source,
  errors,
  showErrors,
  disabled,
  onChange,
}: {
  amountSol: string;
  recipient: string;
  source: "ai" | "manual";
  errors: DraftFieldErrors;
  showErrors: { amountSol: boolean; recipient: boolean };
  disabled: boolean;
  onChange: (field: "amountSol" | "recipient", value: string) => void;
}) {
  const amountError = showErrors.amountSol ? (errors.amountSol ?? null) : null;
  const recipientError = showErrors.recipient ? (errors.recipient ?? null) : null;

  return (
    <fieldset className="space-y-5" disabled={disabled}>
      <legend className="sr-only">Transfer details</legend>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[0.9rem] font-medium text-white">Transfer type</p>
          <p className="font-data text-[0.85rem] text-silver">Native SOL · System Program Transfer</p>
        </div>
        <Badge tone={source === "ai" ? "warning" : "neutral"}>{source === "ai" ? "Filled by AI — review" : "Manual entry"}</Badge>
      </div>

      <Field
        id="amount-sol"
        label="Amount (SOL)"
        hint={`Up to 9 decimals. Devnet demo limit: ${MAX_DEMO_SOL} SOL.`}
        error={amountError}
      >
        <Input
          id="amount-sol"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          placeholder="0.1"
          value={amountSol}
          invalid={Boolean(amountError)}
          aria-describedby={describedBy("amount-sol", Boolean(amountError), true)}
          className="font-data text-lg"
          onChange={(event) => onChange("amountSol", event.target.value)}
        />
      </Field>

      <Field
        id="recipient"
        label="Recipient address (full)"
        hint="Paste the recipient's full Solana address. We won't guess it."
        error={recipientError}
      >
        <Textarea
          id="recipient"
          rows={2}
          autoComplete="off"
          spellCheck={false}
          placeholder="Full base58 address"
          value={recipient}
          invalid={Boolean(recipientError)}
          aria-describedby={describedBy("recipient", Boolean(recipientError), true)}
          className="font-data resize-none text-[0.95rem]"
          onChange={(event) => onChange("recipient", event.target.value)}
        />
      </Field>
    </fieldset>
  );
}
