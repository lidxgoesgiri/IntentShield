/**
 * Product scope settings. These are deliberate constants, not environment
 * variables, so a deployment cannot silently widen the MVP's safety envelope.
 */

export const PRODUCT_NAME = "IntentShield";
export const PRODUCT_TAGLINE = "Know what you sign.";

/** The only cluster this MVP supports (Wallet Standard chain identifier). */
export const SUPPORTED_CHAIN = "solana:devnet" as const;
export type SupportedChain = typeof SUPPORTED_CHAIN;

/**
 * Genesis hash of Solana Devnet. The app asks the configured RPC for its
 * genesis hash and refuses to build transactions when it differs, so a
 * mis-configured mainnet RPC can never be used (fail closed).
 * Verified against https://api.devnet.solana.com on 2026-11-07.
 */
export const DEVNET_GENESIS_HASH = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";

export const SOL_DECIMALS = 9;
export const LAMPORTS_PER_SOL = 1_000_000_000n;

/** Demo safety limit (PRD FR-003: MAX_DEMO_SOL=1). */
export const MAX_DEMO_SOL = "1";
export const MAX_DEMO_LAMPORTS = 1_000_000_000n;

/** Natural-language input limit (PRD FR-002 / §9.3). */
export const MAX_INTENT_TEXT_LENGTH = 300;

/** Native System Program address (all ones in base58). */
export const SYSTEM_PROGRAM_ADDRESS = "11111111111111111111111111111111";

/** Explorer base used for receipts; cluster query param is always devnet. */
export const EXPLORER_BASE_URL = "https://explorer.solana.com";
