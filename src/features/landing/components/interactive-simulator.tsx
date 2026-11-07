"use client";

import { ArrowRight, FlaskConical, Play, RotateCcw, Square } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useReducer, useRef } from "react";
import { AddressDiff } from "@/components/ui/address-diff";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { describeReason } from "@/features/verification/lib/verification-reasons";
import type { VerificationReason } from "@/features/verification/types";
import { formatLamportsAsSol, formatLamportsGrouped } from "@/lib/format/sol";
import { shortenAddress } from "@/lib/format/address";
import { cn } from "@/lib/utils";
import { SIMULATOR_COPY } from "../config/section-copy";
import { createDemoState, demoReducer } from "../simulator/demo-machine";
import { DEMO_INTENT, DEMO_SCENARIOS, scenarioInfo } from "../simulator/demo-scenarios";
import { runDemoCheck, type DemoCheckOptions } from "../simulator/run-demo-check";
import type { DemoDifference, DemoScenario } from "../simulator/types";
import { SimulatorStatus, statusAnnouncement } from "./simulator-status";

const FIELD_LABEL: Record<DemoDifference["field"], string> = {
  recipient: "Recipient",
  amount: "Amount",
  sender: "Sender",
  feePayer: "Fee payer",
  program: "Program",
  action: "Action",
  network: "Network",
  instructions: "Instructions",
};

function lamportsText(value: string | null): string {
  if (value === null) return "—";
  try {
    const lamports = BigInt(value);
    return `${formatLamportsAsSol(lamports)} SOL (${formatLamportsGrouped(lamports)} lamports)`;
  } catch {
    return value;
  }
}

/**
 * S03 — Interactive Simulator (PRD §10.1, §28). Controlled fixtures + the
 * shared pure verifier. It contains no Sign control and imports no wallet,
 * RPC, signing, or broadcasting code (LP-11).
 */
export function InteractiveSimulator({ checkOptions }: { checkOptions?: DemoCheckOptions }) {
  const [state, dispatch] = useReducer(demoReducer, undefined, () => createDemoState("exact-match"));
  const mounted = useRef(true);
  const groupId = useId();
  const { result } = state;
  const info = scenarioInfo(state.scenario);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Execute a run whenever a new loading request is issued (stale results are dropped by the reducer).
  const loadingRequestId = result.status === "loading" ? result.requestId : null;
  const loadingScenario = state.scenario;
  useEffect(() => {
    if (loadingRequestId === null) return;
    const controller = new AbortController();
    runDemoCheck(loadingScenario, { ...checkOptions, signal: controller.signal })
      .then((settled) => {
        if (mounted.current && !controller.signal.aborted) dispatch({ type: "SETTLED", requestId: loadingRequestId, result: settled });
      })
      .catch(() => {
        if (mounted.current && !controller.signal.aborted) {
          dispatch({
            type: "SETTLED",
            requestId: loadingRequestId,
            result: {
              source: "controlled-fixture",
              status: "failed",
              scenario: loadingScenario,
              message: "Demo check could not complete. No security conclusion was produced.",
            },
          });
        }
      });
    return () => controller.abort();
  }, [loadingRequestId, loadingScenario, checkOptions]);

  const decoded = result.status === "success" || result.status === "warning" ? result.decoded : null;
  const differences = result.status === "warning" ? result.differences : [];
  const reasonCodes = result.status === "success" || result.status === "warning" ? result.reasonCodes : [];

  return (
    <div className="hairline-panel overflow-hidden" data-simulator="">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-5 py-4 sm:px-6">
        <Badge tone="demo" icon={<FlaskConical className="size-3.5" aria-hidden />}>
          {SIMULATOR_COPY.label}
        </Badge>
        <p className="type-caption">Same pure verifier as the real app · fixtures only · no wallet involved</p>
      </div>

      <div className="grid lg:grid-cols-12">
        {/* Scenario selector + actions */}
        <div className="space-y-6 border-b border-hairline p-5 sm:p-6 lg:col-span-4 lg:border-b-0 lg:border-r">
          <fieldset>
            <legend id={`${groupId}-legend`} className="type-eyebrow mb-3">
              Sample scenario
            </legend>
            <div role="radiogroup" aria-labelledby={`${groupId}-legend`} className="space-y-2">
              {DEMO_SCENARIOS.map((scenario) => {
                const active = scenario.id === state.scenario;
                return (
                  <label
                    key={scenario.id}
                    className={cn(
                      "flex min-h-14 cursor-pointer items-start gap-3 rounded-[var(--radius-control)] border px-3.5 py-3 transition-colors",
                      "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-mint",
                      active ? "border-mint/60 bg-mint/[0.06]" : "border-hairline hover:border-silver/40",
                    )}
                  >
                    <input
                      type="radio"
                      name={`${groupId}-scenario`}
                      value={scenario.id}
                      checked={active}
                      onChange={() => dispatch({ type: "SELECT", scenario: scenario.id as DemoScenario })}
                      className="mt-1 size-4 accent-[var(--color-mint)]"
                    />
                    <span className="min-w-0">
                      <span className="flex items-center gap-2 font-medium text-white">
                        {scenario.label}
                        {scenario.optional ? <span className="type-caption">optional</span> : null}
                      </span>
                      <span className="block text-[0.85rem] leading-snug text-silver">{scenario.description}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div className="flex flex-wrap gap-3">
            <Button onClick={() => dispatch({ type: "RUN" })} disabled={result.status === "loading"}>
              <Play className="size-4" aria-hidden />
              {result.status === "failed" || result.status === "unavailable" ? "Retry" : "Run Check"}
            </Button>
            <Button variant="secondary" onClick={() => dispatch({ type: "RESET" })} disabled={result.status === "idle"}>
              {result.status === "loading" ? <Square className="size-4" aria-hidden /> : <RotateCcw className="size-4" aria-hidden />}
              {result.status === "loading" ? "Cancel" : "Reset"}
            </Button>
          </div>
        </div>

        {/* Result panels */}
        <div className="space-y-5 p-5 sm:p-6 lg:col-span-8">
          <div aria-live="polite" aria-atomic="true" className="sr-only">
            {statusAnnouncement(result)}
          </div>
          <SimulatorStatus result={result} />

          <div className="grid gap-4 md:grid-cols-2">
            <Panel title="User intent">
              <dl className="space-y-2 text-[0.85rem]">
                <Pair label="Action" value="Transfer native SOL" />
                <Pair label="Amount" value={`${DEMO_INTENT.amountSol} SOL`} mono />
                <Pair label="Recipient" value={DEMO_INTENT.recipient} mono />
                <Pair label="From" value={shortenAddress(DEMO_INTENT.sender, 6, 6)} mono />
              </dl>
            </Panel>
            <Panel title="Proposed transaction">
              {decoded ? (
                <dl className="space-y-2 text-[0.85rem]">
                  <Pair label="Program" value="System Program · Transfer" />
                  <Pair label="Amount" value={lamportsText(decoded.amountLamports)} mono />
                  <Pair label="Recipient" value={decoded.recipient} mono />
                  <Pair label="Message" value={`${decoded.messageBytes} bytes · unsigned`} mono />
                </dl>
              ) : (
                <p className="text-[0.875rem] text-silver">
                  {info.proposedSummary}.{" "}
                  <span className="text-muted">
                    {result.status === "idle" ? "Run the check to decode the actual bytes." : result.status === "loading" ? "Decoding…" : "No decoded result."}
                  </span>
                </p>
              )}
            </Panel>
            <Panel title="Observed differences">
              {result.status === "success" ? <p className="text-[0.875rem] text-mint">None — every supported field matches.</p> : null}
              {result.status === "warning" ? (
                <ul className="space-y-3 text-[0.85rem]">
                  {differences.map((difference) => (
                    <li key={difference.field} className="space-y-1">
                      <p className="font-medium text-warning">
                        {FIELD_LABEL[difference.field]} · {difference.state}
                      </p>
                      {difference.field === "recipient" && difference.actual ? (
                        <AddressDiff expected={difference.expected} actual={difference.actual} className="text-white" />
                      ) : difference.field === "amount" ? (
                        <p className="font-data text-white">
                          {lamportsText(difference.expected)} → <span className="text-warning">{lamportsText(difference.actual)}</span>
                        </p>
                      ) : (
                        <p className="font-data text-white">{difference.actual ?? "—"}</p>
                      )}
                    </li>
                  ))}
                </ul>
              ) : null}
              {result.status !== "success" && result.status !== "warning" ? (
                <p className="text-[0.875rem] text-muted">Shown after a completed check.</p>
              ) : null}
            </Panel>
            <Panel title="Explain result">
              {result.status === "success" ? (
                <p className="text-[0.875rem] text-silver">
                  The verifier decoded one System Program transfer whose source, fee payer, recipient and lamports equal the sample
                  intent. In the real app this would still need a passing Devnet simulation and your wallet’s approval. Matching
                  intent does not prove the destination is trustworthy.
                </p>
              ) : null}
              {result.status === "warning" ? (
                <ul className="space-y-2 text-[0.875rem] text-silver">
                  {reasonCodes.map((code) => {
                    const reason = describeReason(code as VerificationReason);
                    return (
                      <li key={code}>
                        <span className="font-medium text-white">{reason.title}.</span> {reason.detail}{" "}
                        <code className="font-mono text-[0.75rem] text-muted">{code}</code>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
              {result.status === "idle" || result.status === "loading" ? (
                <p className="text-[0.875rem] text-muted">Rule-engine explanation appears here. No AI is used in this demo.</p>
              ) : null}
              {result.status === "failed" || result.status === "unavailable" ? (
                <p className="text-[0.875rem] text-silver">No conclusion was produced, so nothing is shown as matched or blocked.</p>
              ) : null}
            </Panel>
          </div>

          <div className="flex flex-col gap-3 border-t border-hairline pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[0.875rem] text-silver">
              This demo never opens a wallet. The real app needs a Devnet wallet and signs a real transaction.
            </p>
            <Link
              href="/app"
              className="inline-flex min-h-11 shrink-0 items-center gap-2 text-white underline decoration-mint/60 underline-offset-[6px] hover:decoration-mint"
            >
              Try a real Devnet transfer <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-[var(--radius-control)] border border-hairline bg-obsidian/45 p-4">
      <h3 className="type-eyebrow text-[0.72rem]">{title}</h3>
      {children}
    </section>
  );
}

function Pair({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[5.5rem_1fr] gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className={cn("min-w-0 text-white", mono && "font-data")}>{value}</dd>
    </div>
  );
}
