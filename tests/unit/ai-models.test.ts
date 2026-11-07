import { describe, expect, it } from "vitest";
import { getAiConfig, MAX_ALLOWLISTED_MODELS, parseModelList } from "@/server/ai/config";
import { createModelHealth, describeModel, listModelOptions, resolveModelChain } from "@/server/ai/models";

// The exact shape the owner used in .env.local: one variable, comma-separated, uneven spaces.
const OWNER_STYLE =
  "nvidia/nemotron-3-ultra-550b-a55b:free,nvidia/nemotron-3.5-super-vl:free, nvidia/nemotron-3.5-lightning:free,dots-studio/dots-3-note-preview:free, google/gemma-4-26b-a4b-it:free";

describe("model allowlist parsing", () => {
  it("parses a comma-separated OPENROUTER_MODEL; the first entry is the default", () => {
    const config = getAiConfig({ OPENROUTER_API_KEY: "k", OPENROUTER_MODEL: OWNER_STYLE });
    expect(config.configured).toBe(true);
    expect(config.models).toHaveLength(5);
    expect(config.defaultModel).toBe("nvidia/nemotron-3-ultra-550b-a55b:free");
    expect(config.models).toContain("nvidia/nemotron-3.5-lightning:free");
  });

  it("merges OPENROUTER_MODELS after the default, de-duplicated and capped", () => {
    const config = getAiConfig({
      OPENROUTER_API_KEY: "k",
      OPENROUTER_MODEL: "a/default",
      OPENROUTER_MODELS: "b/two, a/default ,c/three",
    });
    expect(config.models).toEqual(["a/default", "b/two", "c/three"]);
    expect(config.defaultModel).toBe("a/default");

    const many = Array.from({ length: 20 }, (_, i) => `p/m${i}`).join(",");
    expect(getAiConfig({ OPENROUTER_API_KEY: "k", OPENROUTER_MODELS: many }).models).toHaveLength(MAX_ALLOWLISTED_MODELS);
  });

  it("drops malformed entries instead of forwarding them", () => {
    expect(parseModelList("good/model, bad model, ../../etc, /nope, x/y:free, ;rm -rf, a/b?c=1")).toEqual(["good/model", "x/y:free"]);
    expect(parseModelList("")).toEqual([]);
    expect(parseModelList(undefined)).toEqual([]);
  });

  it("is not configured without a key, even with models", () => {
    const config = getAiConfig({ OPENROUTER_MODEL: OWNER_STYLE });
    expect(config.configured).toBe(false);
  });
});

describe("model labels (display only)", () => {
  it.each([
    ["nvidia/nemotron-3.5-lightning:free", "Nemotron 3.5 Lightning · NVIDIA (free)"],
    ["google/gemma-4-26b-a4b-it:free", "Gemma 4 26B A4B IT · Google (free)"],
    ["liquid/lfm-2.5-2.6b:free", "LFM 2.5 2.6B · Liquid AI (free)"],
    ["acme-labs/foo-bar", "Foo Bar · Acme Labs"],
  ])("%s → %s", (id, label) => {
    expect(describeModel(id)).toBe(label);
  });

  it("marks exactly one default option", () => {
    const options = listModelOptions(getAiConfig({ OPENROUTER_API_KEY: "k", OPENROUTER_MODEL: OWNER_STYLE }));
    expect(options.filter((o) => o.isDefault)).toHaveLength(1);
    expect(options[0]).toMatchObject({ id: "nvidia/nemotron-3-ultra-550b-a55b:free", isDefault: true });
  });
});

describe("resolveModelChain — server-side validation + fallback plan", () => {
  const config = getAiConfig({ OPENROUTER_API_KEY: "k", OPENROUTER_MODEL: "a/one", OPENROUTER_MODELS: "b/two,c/three" });

  it("uses the default model when none is requested, with one fallback", () => {
    expect(resolveModelChain(config, undefined)).toEqual({ ok: true, requestedModel: "a/one", chain: ["a/one", "b/two"] });
  });

  it("honours an allowlisted choice and falls back to the default", () => {
    expect(resolveModelChain(config, "c/three")).toEqual({ ok: true, requestedModel: "c/three", chain: ["c/three", "a/one"] });
  });

  it("rejects models outside the allowlist", () => {
    expect(resolveModelChain(config, "openai/very-expensive-model")).toEqual({ ok: false, reason: "UNSUPPORTED_MODEL" });
  });

  it("reports NOT_CONFIGURED without a key", () => {
    expect(resolveModelChain(getAiConfig({}), "a/one")).toEqual({ ok: false, reason: "NOT_CONFIGURED" });
  });

  it("retries the same model once when only one is configured", () => {
    const single = getAiConfig({ OPENROUTER_API_KEY: "k", OPENROUTER_MODEL: "a/one" });
    expect(resolveModelChain(single, null)).toEqual({ ok: true, requestedModel: "a/one", chain: ["a/one", "a/one"] });
  });

  it("skips a cooling-down requested model and prefers healthy alternatives", () => {
    let now = 0;
    const health = createModelHealth({ cooldownMs: 60_000, now: () => now });
    health.markFailure("c/three");
    health.markFailure("a/one");
    expect(resolveModelChain(config, "c/three", health)).toEqual({ ok: true, requestedModel: "c/three", chain: ["b/two", "c/three"] });
    now = 60_001;
    expect(resolveModelChain(config, "c/three", health)).toEqual({ ok: true, requestedModel: "c/three", chain: ["c/three", "a/one"] });
  });

  it("still tries the requested model when every alternative is cooling", () => {
    const health = createModelHealth({ now: () => 0 });
    health.markFailure("a/one");
    health.markFailure("b/two");
    expect(resolveModelChain(config, "c/three", health)).toMatchObject({ chain: ["c/three", "a/one"] });
  });

  it("markSuccess clears the cooldown", () => {
    const health = createModelHealth({ now: () => 0 });
    health.markFailure("a/one");
    expect(health.isCooling("a/one")).toBe(true);
    health.markSuccess("a/one");
    expect(health.isCooling("a/one")).toBe(false);
  });
});
