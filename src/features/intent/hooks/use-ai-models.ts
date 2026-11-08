"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchAiModels, readStoredModel, storeModel } from "../lib/ai-models-client";
import { describeModelDisplay, formatModelLabel } from "../lib/model-display";
import type { AiModelsResponse } from "../schema";

export type AiModelOption = AiModelsResponse["models"][number];

export type AiModelsState = Readonly<{
  /** loading → ready (models available) | off (AI not configured) | unknown (list failed to load). */
  status: "loading" | "ready" | "off" | "unknown";
  models: readonly AiModelOption[];
  defaultModel: string | null;
  /** The model the next AI request will ask for (null → server default). */
  selectedModel: string | null;
  select: (id: string) => void;
  retry: () => void;
  labelFor: (id: string | null | undefined) => string;
}>;

/**
 * Model switcher state. The list comes from the server allowlist; the stored
 * choice is a preference that is dropped if the server no longer offers it.
 * Selection only affects who drafts/explains — never verification or signing.
 */
export function useAiModels(): AiModelsState {
  const [status, setStatus] = useState<AiModelsState["status"]>("loading");
  const [models, setModels] = useState<readonly AiModelOption[]>([]);
  const [defaultModel, setDefaultModel] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [loadNonce, setLoadNonce] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetchAiModels({ signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        if (!result.ok) {
          setModels([]);
          setDefaultModel(null);
          setSelectedModel(null);
          setStatus("unknown");
          return;
        }
        const { data } = result;
        if (!data.available || data.models.length === 0) {
          setModels([]);
          setDefaultModel(null);
          setSelectedModel(null);
          setStatus("off");
          return;
        }
        setModels(data.models);
        setDefaultModel(data.defaultModel);
        setSelectedModel(readStoredModel(data.models) ?? data.defaultModel);
        setStatus("ready");
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setModels([]);
          setDefaultModel(null);
          setSelectedModel(null);
          setStatus("unknown");
        }
      });
    return () => controller.abort();
  }, [loadNonce]);

  const retry = useCallback(() => {
    setStatus("loading");
    setLoadNonce((nonce) => nonce + 1);
  }, []);

  const select = useCallback(
    (id: string) => {
      if (!models.some((model) => model.id === id)) return;
      setSelectedModel(id);
      storeModel(id);
    },
    [models],
  );

  const labelFor = useCallback(
    (id: string | null | undefined) => {
      if (!id) return "server default";
      return models.find((model) => model.id === id)?.label ?? formatModelLabel(describeModelDisplay(id));
    },
    [models],
  );

  return useMemo(
    () => ({ status, models, defaultModel, selectedModel, select, retry, labelFor }),
    [status, models, defaultModel, selectedModel, select, retry, labelFor],
  );
}
