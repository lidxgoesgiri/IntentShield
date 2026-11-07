import { z } from "zod";
import { MAX_INTENT_TEXT_LENGTH } from "@/config/product";

/** POST /api/ai/parse-intent request body. */
export const ParseIntentRequestSchema = z.object({
  text: z
    .string()
    .trim()
    .min(1, "Describe the transfer you want to make.")
    .max(MAX_INTENT_TEXT_LENGTH, `Keep the request under ${MAX_INTENT_TEXT_LENGTH} characters.`),
});

const MissingFieldSchema = z.enum(["amountSol", "recipient"]);

/** Strict response contract (PRD §9.3). Anything else is treated as invalid output. */
export const ParseIntentResponseSchema = z
  .object({
    status: z.enum(["complete", "needs_input", "unsupported"]),
    draft: z
      .object({
        action: z.literal("transfer_native_sol").nullable(),
        amountSol: z.string().max(40).nullable(),
        recipient: z.string().max(64).nullable(),
      })
      .strict(),
    missingFields: z.array(MissingFieldSchema).max(2),
    explanation: z.string().max(400),
  })
  .strict();

/** Looser schema for the raw model output before deterministic guards run. */
export const RawModelIntentSchema = z.object({
  status: z.enum(["complete", "needs_input", "unsupported"]),
  draft: z.object({
    action: z.string().nullable().optional(),
    amountSol: z.union([z.string(), z.number()]).nullable().optional(),
    recipient: z.string().nullable().optional(),
  }),
  missingFields: z.array(z.string()).optional(),
  explanation: z.string().optional(),
});

export type RawModelIntent = z.infer<typeof RawModelIntentSchema>;

export const VERIFICATION_REASON_CODES = [
  "SENDER_MISMATCH",
  "RECIPIENT_MISMATCH",
  "AMOUNT_MISMATCH",
  "FEE_PAYER_MISMATCH",
  "WRONG_CLUSTER",
  "UNSUPPORTED_PROGRAM",
  "UNSUPPORTED_INSTRUCTION",
  "UNEXPECTED_ADDITIONAL_INSTRUCTION",
  "MESSAGE_CHANGED",
  "DECODE_FAILED",
  "UNSUPPORTED_MESSAGE_FORMAT",
  "INVALID_INTENT",
] as const;

const decimalSol = z.string().regex(/^\d+(\.\d{1,9})?$/, "decimal SOL string");

/**
 * POST /api/ai/explain request body. Contains only the deterministic verdict
 * and amounts — never addresses, keys, or the user's free text.
 */
export const ExplainRequestSchema = z
  .object({
    status: z.enum(["matched", "blocked", "unable_to_verify"]),
    reasons: z.array(z.enum(VERIFICATION_REASON_CODES)).max(12),
    intendedAmountSol: decimalSol,
    actualAmountSol: decimalSol.nullable(),
    recipientMatches: z.boolean().nullable(),
    simulation: z.enum(["passed", "failed", "unavailable", "not_run"]),
    simulationErrorCode: z
      .string()
      .regex(/^[A-Z0-9_]{1,48}$/)
      .nullable(),
  })
  .strict();

export type ExplainRequest = z.infer<typeof ExplainRequestSchema>;

export const ExplainResponseSchema = z.object({ explanation: z.string().min(1).max(700) }).strict();

export const ApiErrorSchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});
