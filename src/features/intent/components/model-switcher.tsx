"use client";

import { Bot } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AiModelsState } from "../hooks/use-ai-models";

/**
 * AI model switcher (workspace). Choosing a model only changes which
 * allowlisted model drafts and explains — output stays untrusted and the
 * deterministic verifier, simulation and signing gate are unaffected.
 */
export function ModelSwitcher({ ai, disabled }: { ai: AiModelsState; disabled: boolean }) {
  if (ai.status === "off") {
    return (
      <p className="type-caption flex items-start gap-2">
        <Bot className="mt-0.5 size-4 shrink-0" aria-hidden />
        AI drafting is not configured on this deployment. Enter the transfer details manually — every check still runs.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <label htmlFor="ai-model" className="text-[0.9rem] font-medium text-white">
          AI model
        </label>
        {ai.status === "ready" ? (
          <span className="type-caption">
            {ai.models.length} available · default: {ai.labelFor(ai.defaultModel)}
          </span>
        ) : null}
      </div>
      <select
        id="ai-model"
        value={ai.selectedModel ?? ""}
        disabled={disabled || ai.status !== "ready"}
        aria-describedby="ai-model-hint"
        onChange={(event) => ai.select(event.target.value)}
        className={cn(
          "min-h-11 w-full rounded-[var(--radius-control)] border border-hairline bg-obsidian/70 px-3 text-[0.925rem] text-white",
          "hover:border-silver/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint disabled:cursor-not-allowed disabled:opacity-60",
        )}
      >
        {ai.status === "loading" ? <option value="">Loading models…</option> : null}
        {ai.status === "unknown" ? <option value="">Server default model</option> : null}
        {ai.models.map((model) => (
          <option key={model.id} value={model.id}>
            {model.label}
            {model.isDefault ? " — default" : ""}
          </option>
        ))}
      </select>
      <p id="ai-model-hint" className="type-caption">
        Only changes who drafts and explains (untrusted). Approval, verification, simulation and signing are deterministic and
        unaffected. Requests go to the selected third-party model via OpenRouter — never include seed phrases or private keys.
      </p>
    </div>
  );
}

/** Compact active-model indicator for the panel header. */
export function ActiveModelBadge({ ai }: { ai: AiModelsState }) {
  const off = ai.status === "off";
  const label = off ? "AI off · manual entry" : ai.status === "loading" ? "Loading AI models…" : ai.labelFor(ai.selectedModel);
  return (
    <span
      role="status"
      aria-label={off ? "AI drafting is off" : `Active AI model: ${label}`}
      title={ai.selectedModel ?? undefined}
      className={cn(
        "inline-flex max-w-full items-center gap-2 rounded-full border px-2.5 py-1 font-mono text-[0.72rem] uppercase tracking-[0.06em]",
        off ? "border-hairline text-muted" : "border-mint/35 bg-mint/10 text-mint",
      )}
    >
      <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", off ? "bg-muted" : "bg-mint")} />
      <span className="truncate">{off ? label : `AI · ${label}`}</span>
    </span>
  );
}
