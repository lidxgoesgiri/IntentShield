import { isAddress } from "@solana/kit";
import {
  DEVNET_GENESIS_HASH,
  MAX_DEMO_LAMPORTS,
  SUPPORTED_CHAIN,
  SYSTEM_PROGRAM_ADDRESS,
} from "@/config/product";
import type {
  ComparisonRow,
  ComparisonState,
  DecodedMessageSummary,
  DecodedTransfer,
  IntentForVerification,
  VerificationContext,
  VerificationReason,
  VerificationResult,
} from "../types";
import { decodeTransactionMessage, parseSystemTransferData, type DecodedMessage } from "./decode-transaction";
import { fingerprintMessage } from "./fingerprint-message";
import { matchTransferShape } from "./transfer-shape";
import { sortReasons } from "./verification-reasons";

export type VerifyNativeSolTransferInput = Readonly<{
  intent: IntentForVerification;
  /** The exact wire-format message bytes that would be handed to the wallet. */
  messageBytes: ArrayLike<number>;
  context: VerificationContext;
  /** Fingerprint recorded at review time; a different value means the bytes changed. */
  expectedFingerprint?: string | null;
  now?: number;
}>;

const ACTION_LABEL = "Transfer native SOL";
const INSTRUCTIONS_EXPECTED = "1 transfer (+ fixed compute budget)";

function compare(expected: string, actual: string | null): ComparisonState {
  if (actual === null) return "unsupported";
  return expected === actual ? "match" : "changed";
}

function summarize(message: DecodedMessage): DecodedMessageSummary {
  return Object.freeze({
    version: message.version,
    feePayer: message.accounts[0]?.address ?? null,
    lifetimeToken: message.lifetimeToken,
    instructionCount: message.instructions.length,
    staticAccountCount: message.accounts.length,
    programIds: message.instructions.map((instruction) => instruction.programId ?? "unknown"),
  });
}

/**
 * Deterministic, pure verification of a native SOL transfer message against
 * the user's approved intent (PRD FR-005/FR-006, §13.3, §17).
 *
 * The verdict is computed only from the decoded message bytes and the
 * approved intent. It never consults AI output, UI state, or animation state,
 * and it fails closed: anything it cannot positively match is blocked or
 * reported as unable to verify. It never throws.
 */
export function verifyNativeSolTransfer(input: VerifyNativeSolTransferInput): VerificationResult {
  const checkedAt = input.now ?? Date.now();
  const reasons = new Set<VerificationReason>();
  let messageFingerprint = "sha256:unavailable";

  try {
    const { intent, context } = input;
    messageFingerprint = fingerprintMessage(input.messageBytes);

    // 1. Integrity: the bytes must be the ones that were reviewed.
    if (input.expectedFingerprint && input.expectedFingerprint !== messageFingerprint) {
      reasons.add("MESSAGE_CHANGED");
    }

    // 2. Re-validate the approved intent itself (never trust the caller).
    const intentValid =
      typeof intent.sender === "string" &&
      typeof intent.recipient === "string" &&
      isAddress(intent.sender) &&
      isAddress(intent.recipient) &&
      intent.sender !== intent.recipient &&
      typeof intent.amountLamports === "bigint" &&
      intent.amountLamports > 0n &&
      intent.amountLamports <= MAX_DEMO_LAMPORTS;
    if (!intentValid) reasons.add("INVALID_INTENT");

    // 3. Network: Devnet only, confirmed by the RPC genesis hash.
    const networkOk =
      intent.cluster === SUPPORTED_CHAIN &&
      context.cluster === SUPPORTED_CHAIN &&
      context.genesisHash === DEVNET_GENESIS_HASH;
    if (!networkOk) reasons.add("WRONG_CLUSTER");

    const networkRow: ComparisonRow = {
      field: "network",
      expected: "Solana Devnet",
      actual:
        context.cluster === SUPPORTED_CHAIN && context.genesisHash === DEVNET_GENESIS_HASH
          ? "Solana Devnet"
          : `${context.cluster}${context.genesisHash ? "" : " (unverified)"}`,
      state: networkOk ? "match" : "changed",
    };

    // 4. Decode the exact bytes.
    const decodedOutcome = decodeTransactionMessage(input.messageBytes);
    if (!decodedOutcome.ok) {
      if (decodedOutcome.error === "UNSUPPORTED_VERSION") {
        reasons.add("UNSUPPORTED_MESSAGE_FORMAT");
      } else {
        reasons.add("DECODE_FAILED");
      }
      return finalize({
        reasons,
        checkedAt,
        messageFingerprint,
        decoded: null,
        message: null,
        comparisons: [networkRow],
      });
    }

    const message = decodedOutcome.message;

    // 5. Message shape: legacy/v0 only, no lookup tables, exactly one signer.
    if (message.addressTableLookupCount > 0) reasons.add("UNSUPPORTED_MESSAGE_FORMAT");
    if (message.header.numSignerAccounts !== 1 || message.header.numReadonlySignerAccounts !== 0) {
      reasons.add("UNSUPPORTED_MESSAGE_FORMAT");
    }

    const feePayer = message.accounts[0]?.address ?? null;
    if (feePayer !== intent.sender) reasons.add("FEE_PAYER_MISMATCH");

    // 6. Instruction allowlist: exactly one System Program Transfer, optionally
    //    preceded by the app's fixed compute budget (exact values, no accounts).
    const instructions = message.instructions;
    const shape = matchTransferShape(instructions);
    const primary = shape.transfer ?? undefined;

    if (instructions.length === 0) reasons.add("UNSUPPORTED_INSTRUCTION");
    else if (!shape.ok) reasons.add("UNEXPECTED_ADDITIONAL_INSTRUCTION");

    // Compute Budget program accounts must be read-only non-signers.
    if (shape.ok && shape.computeBudget) {
      for (const instruction of instructions.slice(0, 2)) {
        const programAccount = message.accounts[instruction.programIndex];
        if (!programAccount || programAccount.isSigner || programAccount.isWritable) {
          reasons.add("UNSUPPORTED_MESSAGE_FORMAT");
        }
      }
    }

    let decoded: DecodedTransfer | null = null;
    let actualAction: string | null = null;
    let actualProgram: string | null = primary?.programId ?? null;
    let actualSender: string | null = null;
    let actualRecipient: string | null = null;
    let actualAmount: bigint | null = null;

    if (primary) {
      if (primary.programId !== SYSTEM_PROGRAM_ADDRESS) {
        reasons.add("UNSUPPORTED_PROGRAM");
        actualAction = "Unsupported program";
      } else {
        const transferData = parseSystemTransferData(primary.data);
        if (!transferData) {
          reasons.add("UNSUPPORTED_INSTRUCTION");
          actualAction = "Unsupported System instruction";
        } else if (primary.accounts.length !== 2) {
          reasons.add("UNSUPPORTED_INSTRUCTION");
          actualAction = "Malformed System transfer";
        } else {
          const [source, destination] = primary.accounts;
          if (!source || !destination || !source.isSigner || !source.isWritable || !destination.isWritable) {
            reasons.add("UNSUPPORTED_INSTRUCTION");
            actualAction = "Malformed System transfer";
          } else {
            actualAction = ACTION_LABEL;
            actualSender = source.address;
            actualRecipient = destination.address;
            actualAmount = transferData.lamports;
            if (source.address !== intent.sender) reasons.add("SENDER_MISMATCH");
            if (destination.address !== intent.recipient) reasons.add("RECIPIENT_MISMATCH");
            if (transferData.lamports !== intent.amountLamports) reasons.add("AMOUNT_MISMATCH");

            decoded = Object.freeze({
              programId: SYSTEM_PROGRAM_ADDRESS,
              sender: source.address,
              recipient: destination.address,
              feePayer: feePayer ?? "",
              amountLamports: transferData.lamports,
            });
          }
        }

        // The program account itself must be a read-only non-signer, and a
        // single transfer must not load accounts it does not use.
        const programAccount = message.accounts[primary.programIndex];
        if (programAccount && (programAccount.isSigner || programAccount.isWritable)) {
          reasons.add("UNSUPPORTED_MESSAGE_FORMAT");
        }
        // Sender, recipient, System Program (+ Compute Budget program).
        if (shape.ok && message.accounts.length !== (shape.computeBudget ? 4 : 3)) {
          reasons.add("UNSUPPORTED_MESSAGE_FORMAT");
        }
      }
    } else {
      actualProgram = null;
    }

    const comparisons: ComparisonRow[] = [
      {
        field: "action",
        expected: ACTION_LABEL,
        actual: actualAction,
        state: actualAction === ACTION_LABEL ? "match" : "unsupported",
      },
      { field: "sender", expected: intent.sender, actual: actualSender, state: compare(intent.sender, actualSender) },
      {
        field: "recipient",
        expected: intent.recipient,
        actual: actualRecipient,
        state: compare(intent.recipient, actualRecipient),
      },
      {
        field: "amount",
        expected: intent.amountLamports.toString(),
        actual: actualAmount === null ? null : actualAmount.toString(),
        state: compare(intent.amountLamports.toString(), actualAmount === null ? null : actualAmount.toString()),
      },
      { field: "feePayer", expected: intent.sender, actual: feePayer, state: compare(intent.sender, feePayer) },
      {
        field: "program",
        expected: SYSTEM_PROGRAM_ADDRESS,
        actual: actualProgram,
        state: actualProgram === null ? "unsupported" : actualProgram === SYSTEM_PROGRAM_ADDRESS ? "match" : "unsupported",
      },
      networkRow,
      {
        field: "instructions",
        expected: INSTRUCTIONS_EXPECTED,
        actual: !shape.ok
          ? `${instructions.length} instruction(s) — not an allowed layout`
          : shape.computeBudget
            ? "1 transfer + fixed compute budget"
            : "1 transfer",
        state: instructions.length === 0 ? "unsupported" : shape.ok ? "match" : "changed",
      },
    ];

    return finalize({
      reasons,
      checkedAt,
      messageFingerprint,
      decoded,
      message: summarize(message),
      comparisons,
    });
  } catch {
    // Unexpected failure inside the verifier: no conclusion, fail closed.
    reasons.add("DECODE_FAILED");
    return finalize({ reasons, checkedAt, messageFingerprint, decoded: null, message: null, comparisons: [] });
  }
}

function finalize(parts: {
  reasons: Set<VerificationReason>;
  checkedAt: number;
  messageFingerprint: string;
  decoded: DecodedTransfer | null;
  message: DecodedMessageSummary | null;
  comparisons: readonly ComparisonRow[];
}): VerificationResult {
  const reasons = sortReasons([...parts.reasons]);
  const status =
    reasons.length === 0 ? "matched" : reasons.includes("DECODE_FAILED") ? "unable_to_verify" : "blocked";
  return Object.freeze({
    ok: status === "matched",
    status,
    reasons: Object.freeze(reasons),
    checkedAt: parts.checkedAt,
    messageFingerprint: parts.messageFingerprint,
    decoded: parts.decoded,
    message: parts.message,
    comparisons: Object.freeze(parts.comparisons.map((row) => Object.freeze({ ...row }))),
  });
}
