"use client";

import { ArrowRight, FlaskConical, Lock } from "lucide-react";
import Link from "next/link";
import { useId, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TransactionInspector } from "@/features/verification/components/transaction-inspector";
import { shortFingerprint } from "@/features/verification/lib/fingerprint-message";
import { formatLamportsAsSol } from "@/lib/format/sol";
import { cn } from "@/lib/utils";
import { LAB_SCENARIOS, runLabScenario, type LabScenarioId } from "../lib/scenarios";

/**
 * Security Proof Lab (PRD §10.4 / FR-010). Controlled, synthetic, unsigned
 * messages checked by the SAME verifier as /app. This component has no
 * signing or broadcasting capability at all.
 */
export function SecurityProofLab() {
  const [selected, setSelected] = useState<LabScenarioId>("changed-amount");
  const run = useMemo(() => runLabScenario(selected), [selected]);
  const groupId = useId();
  const blocked = !run.result.ok;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-3">
        <Badge tone="demo" icon={<FlaskConical className="size-3.5" aria-hidden />}>
          Controlled demo · No funds moved
        </Badge>
        <span className="type-caption">Controlled test — synthetic, unsigned Devnet-format messages; never broadcast.</span>
      </div>

      <fieldset>
        <legend className="mb-3 font-heading text-lg font-semibold text-white">Choose a scenario</legend>
        <div role="radiogroup" aria-labelledby={`${groupId}-legend`} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <span id={`${groupId}-legend`} className="sr-only">
            Demo scenario
          </span>
          {LAB_SCENARIOS.map((scenario) => {
            const active = scenario.id === selected;
            return (
              <label
                key={scenario.id}
                className={cn(
                  "relative flex min-h-28 cursor-pointer flex-col gap-1.5 rounded-[var(--radius-control)] border p-4 transition-colors",
                  "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-mint",
                  active ? "border-mint/60 bg-mint/[0.06]" : "border-hairline bg-carbon hover:border-silver/40",
                )}
              >
                <input
                  type="radio"
                  name={`${groupId}-scenario`}
                  value={scenario.id}
                  checked={active}
                  onChange={() => setSelected(scenario.id)}
                  className="sr-only"
                />
                <span className="flex items-center justify-between gap-2">
                  <span className="font-medium text-white">{scenario.title}</span>
                  {!scenario.core ? <span className="type-caption">extra</span> : null}
                </span>
                <span className="text-[0.85rem] leading-snug text-silver">{scenario.summary}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="grid gap-6 lg:grid-cols-12">
        <section aria-labelledby="lab-intent" className="hairline-panel space-y-4 p-5 lg:col-span-4">
          <h2 id="lab-intent" className="font-heading text-lg font-semibold text-white">
            Approved intent <span className="type-caption">(sample)</span>
          </h2>
          <dl className="space-y-3 text-[0.85rem]">
            <div>
              <dt className="type-caption">From</dt>
              <dd className="font-data text-white">{run.intent.sender}</dd>
            </div>
            <div>
              <dt className="type-caption">To</dt>
              <dd className="font-data text-white">{run.intent.recipient}</dd>
            </div>
            <div>
              <dt className="type-caption">Amount</dt>
              <dd className="font-data text-white">{formatLamportsAsSol(run.intent.amountLamports)} SOL</dd>
            </div>
            <div>
              <dt className="type-caption">Reviewed message fingerprint</dt>
              <dd className="font-data text-silver">{shortFingerprint(run.reviewedFingerprint)}</dd>
            </div>
          </dl>
          <div className="rounded-[var(--radius-control)] border border-dashed border-hairline p-3">
            <p className="type-eyebrow text-[0.8125rem]">What changed</p>
            <p className="mt-1 text-[0.9rem] text-silver">{run.scenario.tamper}</p>
          </div>
          <p className="type-caption">
            Addresses are SHA-256-derived samples with no known private key — not real wallets.
          </p>
        </section>

        <section aria-label="Verifier result" className="hairline-panel panel-space space-y-5 lg:col-span-8" aria-live="polite">
          <div key={selected} className="status-transition"><TransactionInspector result={run.result} messageBytes={run.messageBytes} /></div>

          <div className="space-y-2 rounded-[var(--radius-control)] border border-hairline bg-obsidian/50 p-4">
            <Button size="lg" className="w-full" disabled aria-describedby="lab-sign-note">
              <Lock className="size-5" aria-hidden /> Sign with Wallet
            </Button>
            <p id="lab-sign-note" className="type-caption">
              {blocked
                ? "Signing disabled: the verifier blocked this transaction. There is no bypass."
                : "The Demo Lab never signs. Even a matched sample cannot be sent from here."}
            </p>
          </div>
        </section>
      </div>

      <div className="flex flex-col gap-4 rounded-[var(--radius-panel)] border border-hairline p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="font-heading text-lg font-semibold text-white">Ready for the real thing?</p>
          <p className="text-[0.925rem] text-silver">
            The workspace leaves this demo: it needs a Devnet wallet and builds a real, wallet-signed transaction.
          </p>
        </div>
        <Button asChild>
          <Link href="/app">
            Try a real Devnet transfer <ArrowRight className="size-4" aria-hidden />
          </Link>
        </Button>
      </div>
    </div>
  );
}
