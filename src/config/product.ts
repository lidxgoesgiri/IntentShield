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

/** Official Solana faucet for free Devnet test SOL. Only linked (new tab), never called by the app. */
export const DEVNET_FAUCET_URL = "https://faucet.solana.com";
/** Below 0.1 SOL the wallet dialog points to the faucet; a sufficient balance keeps the dialog clean. */
export const LOW_DEVNET_BALANCE_LAMPORTS = 100_000_000n;

/** Natural-language input limit (PRD FR-002 / §9.3). */
export const MAX_INTENT_TEXT_LENGTH = 300;

/** Native System Program address (all ones in base58). */
export const SYSTEM_PROGRAM_ADDRESS = "11111111111111111111111111111111";

/**
 * Fixed compute budget carried by every transfer IntentShield builds.
 * Wallets such as Phantom insert their own priority-fee instructions into any
 * unsigned transaction that has no compute budget, which changes the bytes the
 * user reviewed and makes the signing boundary refuse to send. Declaring a
 * small, fixed budget keeps the signed bytes identical. The verifier accepts
 * Compute Budget instructions only with exactly these values.
 * Measured on Devnet (2026-11-07): transfer + both instructions = 450 CU;
 * priority fee = 1,000 CU × 1 micro-lamport ≈ 1 lamport.
 */
export const COMPUTE_BUDGET_PROGRAM_ADDRESS = "ComputeBudget111111111111111111111111111111";
export const TRANSFER_COMPUTE_UNIT_LIMIT = 1_000;
export const TRANSFER_COMPUTE_UNIT_PRICE_MICRO_LAMPORTS = 1n;

/** Lighthouse assertion program some wallets add as a safety guard (named in error messages only). */
export const LIGHTHOUSE_PROGRAM_ADDRESS = "L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95";

/** Explorer base used for receipts; cluster query param is always devnet. */
export const EXPLORER_BASE_URL = "https://explorer.solana.com";
