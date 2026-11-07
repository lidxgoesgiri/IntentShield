"use client";

import { Bot } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/misc";
import type { ExplainRequest } from "@/features/intent/schema";
import { requestVerificationExplanation } from "../services/explain-client";

type ExplainState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; text: string; answeredBy: string | null; fallbackFrom: string | null }
  | { status: "unavailable"; message: string };

/**
 * Optional AI explanation of a verdict the rule engine already produced
 * (PRD §9.1 #4, S04 "AI Explanation"). Display-only and clearly labeled.
 */
export function AiExplanation({
  summary,
  verdictKey,
  disabledReason,
  model,
  labelFor,
}: {
  summary: ExplainRequest;
  verdictKey: string;
  disabledReason: string | null;
  /** Switcher choice; selects who explains, never what the verdict is. */
  model: string | null;
  labelFor: (id: string | null | undefined) => string;
}) {
  const [state, setState] = useState<ExplainState>({ status: "idle" });
  const [forKey, setForKey] = useState(verdictKey);
  const abort = useRef<AbortController | null>(null);

  // A new verdict invalidates any previous explanation (adjust state during render).
  if (forKey !== verdictKey) {
    setForKey(verdictKey);
    setState({ status: "idle" });
  }

  useEffect(() => () => abort.current?.abort(), []);

  async function explain() {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setState({ status: "loading" });
    try {
      const result = await requestVerificationExplanation(summary, { signal: controller.signal, model });
      if (controller.signal.aborted) return;
      setState(
        result.ok
          ? {
              status: "ready",
              text: result.explanation,
              answeredBy: result.meta?.model ?? null,
              fallbackFrom: result.meta?.fallbackUsed ? result.meta.requestedModel : null,
            }
          : { status: "unavailable", message: result.message },
      );
    } catch {
      if (!controller.signal.aborted) setState({ status: "unavailable", message: "AI explanation is unavailable." });
    }
  }

  return (
    <div className="rounded-[var(--radius-control)] border border-dashed border-hairline p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-[0.9rem] font-medium text-white">
          <Bot className="size-4 text-muted" aria-hidden /> AI explanation
          <span className="type-caption">optional · cannot change the verdict</span>
        </p>
        {state.status !== "ready" ? (
          <Button variant="ghost" size="sm" onClick={explain} disabled={state.status === "loading" || Boolean(disabledReason)}>
            {state.status === "loading" ? <Spinner label="Explaining…" /> : "Explain in plain language"}
          </Button>
        ) : null}
      </div>
      <div aria-live="polite" className="mt-2 text-[0.925rem] leading-relaxed">
        {state.status === "ready" ? (
          <>
            <p className="text-silver">{state.text}</p>
            {state.answeredBy ? (
              <p className="type-caption mt-1">
                Explained by {labelFor(state.answeredBy)}
                {state.fallbackFrom ? ` — fallback after ${labelFor(state.fallbackFrom)} failed` : ""}.
              </p>
            ) : null}
          </>
        ) : null}
        {state.status === "unavailable" ? <p className="text-muted">{state.message}</p> : null}
        {disabledReason && state.status === "idle" ? <p className="type-caption">{disabledReason}</p> : null}
      </div>
    </div>
  );
}
