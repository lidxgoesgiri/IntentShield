/**
 * Display names for allowlisted AI models (presentation only).
 *
 * The model id is never changed: it is what the server validates and sends to
 * OpenRouter, including any `:variant` suffix such as `:free`. Display names
 * come from an explicit catalog; unknown ids fall back to a readable name
 * built from the id's slug. The variant suffix is routing metadata, not part of
 * a model's name, so it is never shown.
 */

export type ModelDisplay = Readonly<{
  /** Short product name, e.g. "Nemotron 3 Ultra". */
  name: string;
  /** Model maker, e.g. "NVIDIA". */
  provider: string;
  /** Facts stated by the id itself (size, tuning, preview). Never marketing claims. */
  detail: string | null;
}>;

/** Keyed by model id without its `:variant` suffix. */
const CATALOG: Readonly<Record<string, ModelDisplay>> = {
  "nvidia/nemotron-3.5-super-vl": { name: "Nemotron 3.5 Super VL", provider: "NVIDIA", detail: "Vision-language" },
  "nvidia/nemotron-3-ultra-550b-a55b": { name: "Nemotron 3 Ultra", provider: "NVIDIA", detail: "550B MoE · 55B active" },
  "nvidia/nemotron-3.5-lightning": { name: "Nemotron 3.5 Lightning", provider: "NVIDIA", detail: null },
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning": {
    name: "Nemotron 3 Nano Omni",
    provider: "NVIDIA",
    detail: "Reasoning · 30B MoE · 3B active",
  },
  "dots-studio/dots-3-note-preview": { name: "Dots 3 Note", provider: "Dots Studio", detail: "Preview" },
  "xingchen-agi/xing4.0-29b-a4b": { name: "Xing 4.0", provider: "XingChen", detail: "29B MoE · 4B active" },
  "google/gemma-4-26b-a4b-it": { name: "Gemma 4 26B", provider: "Google", detail: "Instruction-tuned · 4B active" },
  "liquid/lfm-2.5-2.6b": { name: "LFM 2.5", provider: "Liquid AI", detail: "2.6B" },
};

const PROVIDER_NAMES: Readonly<Record<string, string>> = {
  anthropic: "Anthropic",
  deepseek: "DeepSeek",
  "dots-studio": "Dots Studio",
  google: "Google",
  liquid: "Liquid AI",
  "meta-llama": "Meta",
  mistralai: "Mistral",
  nvidia: "NVIDIA",
  openai: "OpenAI",
  qwen: "Qwen",
  "x-ai": "xAI",
  "xingchen-agi": "XingChen",
};

const KNOWN_ACRONYMS = new Set(["lfm", "gpt", "llm", "vlm", "moe", "agi"]);
/** Words that describe a pricing or routing tier, not the model. */
const TIER_WORDS = new Set(["free", "paid", "beta", "nitro", "floor", "online", "extended"]);

function titleToken(token: string): string {
  // Sizes and versions (26b, 3.5, a4b, 2.6b) read best in upper case.
  if (/^[\d.]+[a-z]?$/i.test(token) || /^[a-z]\d+[a-z]$/i.test(token)) return token.toUpperCase();
  // Two-letter tokens (vl, it) and known acronyms; ordinary words stay words.
  if (/^[a-z]{1,2}$/i.test(token) || KNOWN_ACRONYMS.has(token.toLowerCase())) return token.toUpperCase();
  return token.charAt(0).toUpperCase() + token.slice(1);
}

/** The id without its OpenRouter `:variant` suffix (used only for lookup and display). */
export function baseModelId(id: string): string {
  const colon = id.lastIndexOf(":");
  return colon > id.indexOf("/") ? id.slice(0, colon) : id;
}

export function describeModelDisplay(id: string): ModelDisplay {
  const base = baseModelId(id.trim());
  const known = CATALOG[base];
  if (known) return known;

  const slash = base.indexOf("/");
  const org = slash > 0 ? base.slice(0, slash) : "";
  const slug = slash > 0 ? base.slice(slash + 1) : base;
  const name =
    slug
      .split(/[-_]/)
      .filter((token) => token && !TIER_WORDS.has(token.toLowerCase()))
      .map(titleToken)
      .join(" ") || slug;
  const provider = PROVIDER_NAMES[org] ?? org.split("-").filter(Boolean).map(titleToken).join(" ");
  return { name, provider, detail: null };
}

/** One-line label for attribution text, e.g. "Nemotron 3 Ultra · NVIDIA". */
export function formatModelLabel(display: ModelDisplay): string {
  return display.provider ? `${display.name} · ${display.provider}` : display.name;
}
