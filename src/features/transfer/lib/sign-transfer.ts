import {
  getBase58Decoder,
  getBase64EncodedWireTransaction,
  getPublicKeyFromAddress,
  verifySignature,
  type Address,
  type SignatureBytes,
  type Transaction,
  type TransactionMessageBytes,
} from "@solana/kit";
import type { ApprovedIntent } from "@/features/intent/types";
import { bytesEqual, fingerprintMessage } from "@/features/verification/lib/fingerprint-message";
import { verifyNativeSolTransfer } from "@/features/verification/lib/verify-native-sol-transfer";
import type { VerificationContext, VerificationResult } from "@/features/verification/types";
import type { SignedTransfer, SimulationResult } from "../types";
import type { PreparedTransfer } from "./build-transfer";

export type SignBoundaryErrorCode =
  | "GATE_CLOSED"
  | "MESSAGE_CHANGED"
  | "UNEXPECTED_OUTPUT"
  | "SIGNATURE_MISSING"
  | "SIGNATURE_INVALID"
  | "SIGNATURE_UNVERIFIABLE"
  | "WALLET_REJECTED"
  | "WALLET_ERROR";

export class SignBoundaryError extends Error {
  readonly code: SignBoundaryErrorCode;
  constructor(code: SignBoundaryErrorCode, message: string) {
    super(message);
    this.name = "SignBoundaryError";
    this.code = code;
  }
}

/** Minimal signer surface: Wallet Standard `solana:signTransaction` via Kit. */
export type TransactionSignerPort = Readonly<{
  modifyAndSignTransactions: (
    transactions: readonly Transaction[],
    config?: { abortSignal?: AbortSignal },
  ) => Promise<readonly Transaction[]>;
}>;

export type SigningGateInput = Readonly<{
  intent: ApprovedIntent | null;
  prepared: PreparedTransfer | null;
  verification: VerificationResult | null;
  simulation: SimulationResult | null;
}>;

/** All gates that must hold before a wallet prompt may be opened. */
export function isSigningGateOpen(input: SigningGateInput): boolean {
  const { intent, prepared, verification, simulation } = input;
  return Boolean(
    intent &&
      prepared &&
      verification &&
      simulation &&
      verification.ok &&
      verification.status === "matched" &&
      verification.reasons.length === 0 &&
      simulation.ok &&
      simulation.status === "passed" &&
      prepared.fingerprint === verification.messageFingerprint &&
      simulation.simulatedFingerprint === prepared.fingerprint,
  );
}

const REJECTION_PATTERN = /reject|denied|declin|cancel|closed|abort/i;

export function isUserRejection(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as { code?: unknown; name?: unknown; message?: unknown };
  if (record.code === 4001 || record.code === "ACTION_REJECTED") return true;
  const text = `${String(record.name ?? "")} ${String(record.message ?? "")}`;
  return REJECTION_PATTERN.test(text);
}

/**
 * The signing boundary (PRD §13.3 "Verify unchanged message fingerprint at
 * sign boundary"). Re-verifies the exact reviewed bytes, asks the wallet to
 * sign them, then refuses to continue unless the wallet returned those same
 * bytes with a valid Ed25519 signature from the approved sender. The wire
 * transaction is rebuilt from the *reviewed* bytes, never the wallet's object.
 */
export async function signVerifiedTransfer(args: {
  intent: ApprovedIntent;
  prepared: PreparedTransfer;
  verification: VerificationResult;
  simulation: SimulationResult;
  context: VerificationContext;
  signer: TransactionSignerPort;
  signal?: AbortSignal;
  now?: () => number;
}): Promise<SignedTransfer> {
  const { intent, prepared, verification, simulation, context, signer } = args;
  const now = args.now ?? Date.now;

  if (!isSigningGateOpen({ intent, prepared, verification, simulation })) {
    throw new SignBoundaryError("GATE_CLOSED", "Verification and simulation must both pass before signing.");
  }

  const recheck = verifyNativeSolTransfer({
    intent,
    messageBytes: prepared.messageBytes,
    context,
    expectedFingerprint: verification.messageFingerprint,
    now: now(),
  });
  if (!recheck.ok || !bytesEqual(prepared.transaction.messageBytes, prepared.messageBytes)) {
    throw new SignBoundaryError("MESSAGE_CHANGED", "The transaction changed after review. Signing was blocked.");
  }

  let outputs: readonly Transaction[];
  try {
    outputs = await signer.modifyAndSignTransactions(
      [prepared.transaction],
      args.signal ? { abortSignal: args.signal } : undefined,
    );
  } catch (error) {
    if (isUserRejection(error)) {
      throw new SignBoundaryError("WALLET_REJECTED", "You rejected the request in your wallet. Nothing was sent.");
    }
    throw new SignBoundaryError(
      "WALLET_ERROR",
      "The wallet did not return a signature. Nothing was sent.",
    );
  }

  if (outputs.length !== 1 || !outputs[0]) {
    throw new SignBoundaryError("UNEXPECTED_OUTPUT", "The wallet returned an unexpected result. Nothing was sent.");
  }
  const signedTx = outputs[0];

  if (!bytesEqual(signedTx.messageBytes, prepared.messageBytes)) {
    throw new SignBoundaryError(
      "MESSAGE_CHANGED",
      "Your wallet modified the transaction before signing. IntentShield cannot re-verify it, so it was not sent.",
    );
  }

  const signerKeys = Object.keys(signedTx.signatures);
  if (signerKeys.length !== 1 || signerKeys[0] !== intent.sender) {
    throw new SignBoundaryError("UNEXPECTED_OUTPUT", "Unexpected signer set returned by the wallet. Nothing was sent.");
  }
  const signatureBytes = signedTx.signatures[intent.sender as Address] ?? null;
  if (!signatureBytes || signatureBytes.length !== 64) {
    throw new SignBoundaryError("SIGNATURE_MISSING", "The wallet did not sign with the approved account.");
  }

  let valid = false;
  try {
    const publicKey = await getPublicKeyFromAddress(intent.sender);
    valid = await verifySignature(publicKey, signatureBytes as SignatureBytes, prepared.messageBytes);
  } catch {
    throw new SignBoundaryError(
      "SIGNATURE_UNVERIFIABLE",
      "This browser cannot verify Ed25519 signatures, so the transaction was not sent.",
    );
  }
  if (!valid) {
    throw new SignBoundaryError("SIGNATURE_INVALID", "The wallet's signature is not valid for the reviewed transaction.");
  }

  const finalTransaction: Transaction = Object.freeze({
    messageBytes: Uint8Array.from(prepared.messageBytes) as unknown as TransactionMessageBytes,
    signatures: Object.freeze({ [intent.sender]: signatureBytes as SignatureBytes }),
  });

  return Object.freeze({
    signature: getBase58Decoder().decode(signatureBytes),
    wireBase64: getBase64EncodedWireTransaction(finalTransaction),
    signedMessageFingerprint: fingerprintMessage(prepared.messageBytes),
    signedAt: now(),
  });
}
