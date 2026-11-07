/**
 * Landing copy map (PRD §10.1, §21, §31). Confident, calm, technically precise —
 * no hype, no unverifiable numbers, no "100% safe".
 */
export const HERO_COPY = {
  eyebrow: "IntentShield / Solana Devnet",
  title: ["Know what", "you sign."],
  subtitle: "See the transaction. Before you approve it.",
  body: "Describe a SOL transfer, inspect the exact supported transaction fields, and confirm what your wallet is being asked to sign.",
  primaryCta: "Launch IntentShield",
  secondaryCta: "Explore the Simulator",
  trust: [
    {
      label: "Non-custodial",
      detail: "Your wallet holds the keys and signs. IntentShield never asks for, stores, or sends seed phrases or private keys.",
    },
    {
      label: "Devnet-only",
      detail: "The app verifies the RPC genesis hash and refuses any network other than Solana Devnet. Mainnet is disabled in this MVP.",
    },
    {
      label: "Deterministic checks",
      detail: "Rule-based comparison of the exact message against your approved intent. AI can explain, but never decides or signs.",
    },
  ],
} as const;

export const PROBLEM_COPY = {
  title: "A signature should never be a guessing game.",
  lead: "Wallet prompts show raw transaction data that is easy to skim and hard to understand. A single changed digit or character is enough to move funds somewhere you never meant.",
  caveat: "Intent matching does not establish whether a recipient is trustworthy.",
} as const;

export const SIMULATOR_COPY = {
  title: "See the check before the signature.",
  lead: "Pick a controlled sample and run the same deterministic verifier the real app uses before it lets a wallet sign.",
  label: "Controlled demo · No funds moved",
} as const;

export const HOW_COPY = {
  title: "Intelligence before approval.",
  lead: "Three stages narrate what happens between your approval and your wallet's signature prompt.",
  steps: [
    {
      id: "simulation",
      index: "01",
      title: "Simulation",
      body: "The exact unsigned message is executed against Solana Devnet RPC. An error, an unreadable answer, or an unreachable RPC blocks signing.",
      limit: "Simulation predicts this run; it cannot vouch for the recipient.",
    },
    {
      id: "validation",
      index: "02",
      title: "Deterministic Validation",
      body: "The final message is decoded and compared field by field with your approved intent: program, source, fee payer, recipient, lamports, network, one transfer instruction.",
      limit: "The rule engine — not a model — decides whether signing unlocks.",
    },
    {
      id: "explanation",
      index: "03",
      title: "AI Explanation",
      body: "Optionally, AI turns the verified outcome and its limits into plain language you can act on.",
      limit: "AI cannot change the verdict and has no access to signing.",
    },
  ],
} as const;

export const PRODUCT_COPY = {
  title: "Built for the moment before sign.",
  lead: "One workspace: describe the transfer, approve exact values, then read what the transaction will actually execute.",
} as const;

export const SECURITY_COPY = {
  title: "Trust the checks, not the glow.",
  lead: "What IntentShield verifies, what AI only explains, and what nobody here can verify for you.",
  verified: [
    "Exactly one System Program Transfer, plus the app's own fixed compute budget (allowlist)",
    "Source account and fee payer are your connected wallet",
    "Recipient address — every character",
    "Amount in integer lamports",
    "Solana Devnet, confirmed by the RPC genesis hash",
    "Final-message fingerprint unchanged at the signing boundary",
    "Wallet returned the same bytes with a valid signature",
    "RPC simulation of the exact message succeeded",
  ],
  explained: [
    "Turning your sentence into an editable draft",
    "Plain-language explanation of a verdict the rule engine already produced",
  ],
  notVerified: [
    "Whether the recipient is trustworthy",
    "Reputation or scam history of any address",
    "Safety of other protocols or arbitrary programs",
    "Mainnet transactions (disabled)",
    "Malicious browser extensions or a compromised wallet",
    "What happens after this transaction",
  ],
} as const;

export const DEVELOPER_COPY = {
  title: "Built on inspectable primitives.",
  eyebrowTitle: "Developer-first. Evidence-first.",
  stack: [
    { name: "Next.js + TypeScript", detail: "App Router, strict types, server-only AI routes." },
    { name: "Solana Kit", detail: "@solana/kit compiles, decodes and simulates the exact message." },
    { name: "System Program transfers", detail: "@solana-program/system · one-transfer allowlist with a fixed compute budget." },
    { name: "Solana Devnet", detail: "Genesis-hash network guard; mainnet disabled." },
    { name: "Deterministic verifier", detail: "Pure function shared by the app, Demo Lab and this page." },
    { name: "AI optional", detail: "OpenRouter-compatible, server-side, rate-limited, never trusted." },
  ],
} as const;

export const FINAL_COPY = {
  title: ["Understand first.", "Sign second."],
  sub: "Solana Devnet · No custody · Native SOL transfers only",
  caveat: "IntentShield does not guarantee recipient safety. It shows you exactly what you are about to sign.",
} as const;
