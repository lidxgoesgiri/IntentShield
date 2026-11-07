"use client";

import { PenLine, Sparkles } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { Spinner } from "@/components/ui/misc";
import { MAX_INTENT_TEXT_LENGTH } from "@/config/product";
import type { AiNotice } from "@/features/transfer/types";
import type { AiModelsState } from "../hooks/use-ai-models";
import { ModelSwitcher } from "./model-switcher";

/**
 * Natural-language composer (PRD FR-002). The AI only fills an editable,
 * untrusted draft; manual entry is always available.
 */
export function IntentComposer({
  text,
  onTextChange,
  onAnalyze,
  onManual,
  parsing,
  disabled,
  aiDisabledReason,
  notice,
  ai,
}: {
  text: string;
  onTextChange: (value: string) => void;
  onAnalyze: () => void;
  onManual: () => void;
  parsing: boolean;
  disabled: boolean;
  aiDisabledReason: string | null;
  notice: AiNotice | null;
  ai: AiModelsState;
}) {
  const length = text.length;
  const tooLong = length > MAX_INTENT_TEXT_LENGTH;
  const empty = text.trim().length === 0;

  return (
    <div className="space-y-4">
      <Field
        id="intent-text"
        label="Describe the transfer"
        hint="Example: Send 0.1 SOL to <full recipient address>. Names are never resolved — paste the full address."
        error={tooLong ? `Keep the request under ${MAX_INTENT_TEXT_LENGTH} characters.` : null}
        aside={
          <span className={tooLong ? "font-mono text-[0.8rem] text-danger" : "type-caption font-mono"} aria-live="polite">
            {length}/{MAX_INTENT_TEXT_LENGTH}
          </span>
        }
      >
        <Textarea
          id="intent-text"
          rows={3}
          value={text}
          disabled={disabled}
          invalid={tooLong}
          placeholder="Send 0.1 SOL to 9x…"
          aria-describedby={tooLong ? "intent-text-error" : "intent-text-hint"}
          onChange={(event) => onTextChange(event.target.value)}
          onKeyDown={(event) => {
            // Cmd/Ctrl+Enter analyzes; Enter never signs anything (PRD §12).
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && !empty && !tooLong && !aiDisabledReason) {
              event.preventDefault();
              onAnalyze();
            }
          }}
        />
      </Field>

      <ModelSwitcher ai={ai} disabled={disabled || parsing} />

      <div className="flex flex-wrap gap-3">
        <Button onClick={onAnalyze} disabled={disabled || parsing || empty || tooLong || Boolean(aiDisabledReason)}>
          {parsing ? <Spinner className="text-obsidian" label="Analyzing…" /> : (
            <>
              <Sparkles className="size-4" aria-hidden /> Analyze Intent
            </>
          )}
        </Button>
        <Button variant="secondary" onClick={onManual} disabled={disabled}>
          <PenLine className="size-4" aria-hidden /> Enter Manually
        </Button>
      </div>
      {aiDisabledReason ? <p className="type-caption">{aiDisabledReason}</p> : null}

      {notice ? (
        <Alert
          role="status"
          tone={notice.kind === "parsed" ? "info" : notice.kind === "unsupported" ? "warning" : notice.kind === "needs_input" ? "warning" : "info"}
          title={notice.message}
        >
          {notice.explanation ? (
            <p>
              <span className="type-eyebrow mr-2 text-[0.7rem]">AI note · untrusted</span>
              {notice.explanation}
            </p>
          ) : null}
          {notice.model ? (
            <p className="type-caption mt-1" data-ai-attribution="">
              Answered by {ai.labelFor(notice.model.model)}
              {notice.model.fallbackUsed ? ` — fallback after ${ai.labelFor(notice.model.requestedModel)} failed` : ""}.
            </p>
          ) : null}
        </Alert>
      ) : null}
    </div>
  );
}
