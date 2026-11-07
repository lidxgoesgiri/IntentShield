/**
 * Map Solana `TransactionError` values (as returned by RPC JSON) to stable
 * codes and plain-language copy. Unknown shapes are reported verbatim-ish but
 * never treated as success.
 */

export type DescribedTransactionError = Readonly<{ code: string; message: string }>;

const SYSTEM_CUSTOM_ERRORS: Record<number, DescribedTransactionError> = {
  0: { code: "ACCOUNT_ALREADY_IN_USE", message: "The destination account is already in use." },
  1: {
    code: "INSUFFICIENT_LAMPORTS",
    message: "The sender does not have enough SOL for this transfer.",
  },
};

export function describeTransactionError(err: unknown): DescribedTransactionError {
  if (err === null || err === undefined) return { code: "NONE", message: "No error." };

  if (typeof err === "string") {
    switch (err) {
      case "BlockhashNotFound":
        return {
          code: "BLOCKHASH_NOT_FOUND",
          message: "The transaction's blockhash expired or is unknown to the network. Review and approve again.",
        };
      case "AccountNotFound":
        return {
          code: "ACCOUNT_NOT_FOUND",
          message: "The sender account has no SOL on Devnet yet. Fund it from the Devnet faucet first.",
        };
      case "InsufficientFundsForFee":
        return { code: "INSUFFICIENT_FUNDS_FOR_FEE", message: "The sender cannot pay the network fee." };
      case "AlreadyProcessed":
        return { code: "ALREADY_PROCESSED", message: "This transaction was already processed." };
      default:
        return { code: err.replace(/[^A-Za-z0-9]/g, "_").toUpperCase(), message: `Network reported: ${err}.` };
    }
  }

  if (typeof err === "object") {
    const record = err as Record<string, unknown>;
    if ("InsufficientFundsForRent" in record) {
      return {
        code: "INSUFFICIENT_FUNDS_FOR_RENT",
        message:
          "This transfer would leave an account below Solana's rent-exempt minimum (≈0.00089 SOL for a new account). Send more, or keep more in the sender.",
      };
    }
    const instructionError = record.InstructionError;
    if (Array.isArray(instructionError) && instructionError.length === 2) {
      const detail = instructionError[1] as unknown;
      if (detail && typeof detail === "object" && "Custom" in (detail as Record<string, unknown>)) {
        const custom = Number((detail as Record<string, unknown>).Custom);
        const known = SYSTEM_CUSTOM_ERRORS[custom];
        if (known) return known;
        return { code: `CUSTOM_${custom}`, message: `The program returned custom error ${custom}.` };
      }
      return {
        code: "INSTRUCTION_ERROR",
        message: `Instruction failed: ${typeof detail === "string" ? detail : JSON.stringify(detail)}.`,
      };
    }
  }

  let serialized = "unknown error";
  try {
    serialized = JSON.stringify(err, (_key, value: unknown) => (typeof value === "bigint" ? value.toString() : value));
  } catch {
    /* keep default */
  }
  return { code: "UNKNOWN_TRANSACTION_ERROR", message: `Network reported an unrecognized error: ${serialized}` };
}
