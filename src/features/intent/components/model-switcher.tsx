"use client";

import { Bot, Check, ChevronDown } from "lucide-react";
import { Select } from "radix-ui";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AiModelOption, AiModelsState } from "../hooks/use-ai-models";

type Display = Readonly<{ name: string; provider: string; detail: string | null }>;

/** Display fields from the server; older payloads only carry `label`. */
function displayOf(model: AiModelOption): Display {
  return { name: model.name ?? model.label, provider: model.provider ?? "", detail: model.detail ?? null };
}

function initials(provider: string): string {
  const words = provider.replace(/[^a-z0-9 ]/gi, " ").split(/\s+/).filter(Boolean);
  if (words.length === 0) return "AI";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]![0]! + words[1]![0]!).toUpperCase();
}

/** Provider monogram — no third-party logos are bundled. */
function ProviderMark({ provider, active = false }: { provider: string; active?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-[8px] border font-mono text-[0.8125rem] font-medium",
        active ? "border-mint/40 bg-mint/10 text-mint" : "border-hairline bg-obsidian text-silver",
      )}
    >
      {initials(provider)}
    </span>
  );
}

function metaLine(display: Display, isDefault: boolean): string {
  return [display.provider, display.detail, isDefault ? "default" : null].filter(Boolean).join(" · ");
}

/**
 * AI model switcher (workspace). Choosing a model only changes which
 * allowlisted model drafts and explains — output stays untrusted and the
 * deterministic verifier, simulation and signing gate are unaffected.
 * The value is always the exact model id the server allowlists.
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

  const ready = ai.status === "ready";
  const selected = ai.models.find((model) => model.id === ai.selectedModel) ?? null;
  const selectedDisplay = selected ? displayOf(selected) : null;
  const placeholder = ai.status === "loading" ? "Loading models…" : "Server default model";
  const defaultOption = ai.models.find((model) => model.isDefault) ?? null;

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <label htmlFor="ai-model" className="text-[0.9rem] font-medium text-white">
          AI model
        </label>
        {ready ? (
          <span className="text-[0.8125rem] text-muted">
            {ai.models.length} available{defaultOption ? ` · default: ${displayOf(defaultOption).name}` : ""}
          </span>
        ) : null}
      </div>

      <Select.Root value={ai.selectedModel ?? ""} onValueChange={ai.select} disabled={disabled || !ready}>
        <Select.Trigger
          id="ai-model"
          aria-describedby="ai-model-hint"
          className={cn(
            "model-trigger group flex min-h-13 w-full items-center gap-3 rounded-[var(--radius-control)] border border-control bg-obsidian/70 px-3 py-2 text-left",
            "transition-[border-color,background-color] duration-200 hover:border-silver/35 hover:bg-obsidian",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint",
            "data-[state=open]:border-mint/45 disabled:cursor-not-allowed disabled:opacity-60",
          )}
        >
          {selectedDisplay ? <ProviderMark provider={selectedDisplay.provider} active /> : <ProviderMark provider="AI" />}
          <span className="min-w-0 flex-1">
            <Select.Value placeholder={placeholder}>
              {selectedDisplay ? (
                <span className="block min-w-0">
                  <span className="block truncate text-[0.9375rem] font-medium text-white" title={selectedDisplay.name}>
                    {selectedDisplay.name}
                  </span>
                  <span className="block truncate text-[0.8125rem] text-muted">
                    {[selectedDisplay.provider, selected?.isDefault ? "default" : null].filter(Boolean).join(" · ")}
                  </span>
                </span>
              ) : null}
            </Select.Value>
          </span>
          <Select.Icon asChild>
            <ChevronDown
              className="size-4 shrink-0 text-muted transition-transform duration-200 group-data-[state=open]:rotate-180 group-data-[state=open]:text-mint"
              aria-hidden
            />
          </Select.Icon>
        </Select.Trigger>

        <Select.Portal>
          <Select.Content
            position="popper"
            side="bottom"
            align="start"
            sideOffset={8}
            collisionPadding={16}
            className={cn(
              "model-menu z-50 w-[var(--radix-select-trigger-width)] max-w-[calc(100vw-32px)] overflow-hidden rounded-[var(--radius-panel)] border border-hairline",
              "bg-carbon shadow-[var(--shadow-overlay)]",
            )}
            style={{ maxHeight: "min(420px, var(--radix-select-content-available-height))" }}
          >
            <p className="border-b border-hairline px-4 py-2.5 text-[0.8125rem] text-muted">Drafts &amp; explanations · untrusted</p>
            <Select.Viewport className="p-1.5">
              {ai.models.map((model) => {
                const display = displayOf(model);
                return (
                  <Select.Item
                    key={model.id}
                    value={model.id}
                    textValue={display.name}
                    className={cn(
                      "model-option relative flex cursor-pointer select-none items-center gap-3 rounded-[10px] py-2.5 pl-3 pr-9 outline-none",
                      "transition-colors duration-150 data-[highlighted]:bg-white/[0.045] data-[disabled]:opacity-50",
                    )}
                  >
                    <ProviderMark provider={display.provider} active={model.id === ai.selectedModel} />
                    <span className="min-w-0 flex-1">
                      <Select.ItemText>
                        <span className="block text-[0.925rem] font-medium leading-snug text-white">{display.name}</span>
                      </Select.ItemText>
                      <span className="mt-0.5 block text-[0.8125rem] leading-snug text-muted">
                        {metaLine(display, model.isDefault)}
                      </span>
                    </span>
                    <Select.ItemIndicator className="absolute right-3 top-1/2 -translate-y-1/2 text-mint">
                      <Check className="size-4" aria-hidden />
                    </Select.ItemIndicator>
                  </Select.Item>
                );
              })}
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>

      {ai.status === "unknown" ? (
        <div role="status" className="rounded-[var(--radius-control)] border border-warning/40 px-3 py-2 text-[0.8125rem] text-warning">
          <p>Model list unavailable. Drafting can still use the server default; manual entry remains available.</p>
          <Button variant="ghost" size="sm" className="mt-1 text-warning" onClick={ai.retry} disabled={disabled}>
            Retry model list
          </Button>
        </div>
      ) : null}

      <p id="ai-model-hint" className="text-[0.8125rem] leading-relaxed text-muted">
        Untrusted drafts and explanations via OpenRouter. Rules control signing. Never include seed phrases or private keys.
      </p>
    </div>
  );
}

/** Active-model indicator for the panel header (a status line, not a pill). */
export function ActiveModelBadge({ ai }: { ai: AiModelsState }) {
  const off = ai.status === "off";
  const ready = ai.status === "ready";
  const label = off ? "AI off · manual entry" : ai.status === "loading" ? "Loading AI models…" : ai.status === "unknown" ? "using server default" : ai.labelFor(ai.selectedModel);
  const selected = ai.models.find((model) => model.id === ai.selectedModel);
  const shortName = selected ? displayOf(selected).name : label;
  return (
    <span
      role="status"
      aria-label={off ? "AI drafting is off" : `Active AI model: ${label}`}
      title={ai.selectedModel ?? undefined}
      className={cn(
        "inline-flex min-w-0 max-w-full items-center gap-2 text-[0.8125rem] font-medium",
        ready ? "text-mint" : "text-muted",
      )}
    >
      <span aria-hidden className={cn("model-live-dot size-1.5 shrink-0 rounded-full", ready ? "bg-mint" : "bg-muted")} data-live={ready ? "true" : "false"} />
      <span className="truncate">{off ? label : `AI · ${shortName}`}</span>
    </span>
  );
}
