import { getTransferSolInstruction } from "@solana-program/system";
import {
  appendTransactionMessageInstructions,
  compileTransaction,
  createNoopSigner,
  createTransactionMessage,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  type Address,
  type Blockhash,
} from "@solana/kit";
import { DEVNET_GENESIS_HASH, SUPPORTED_CHAIN } from "@/config/product";
import { buildNativeSolTransfer } from "@/features/transfer/lib/build-transfer";
import { fingerprintMessage } from "@/features/verification/lib/fingerprint-message";
import { verifyNativeSolTransfer } from "@/features/verification/lib/verify-native-sol-transfer";
import type { IntentForVerification, VerificationContext, VerificationResult } from "@/features/verification/types";
import { deriveDemoParties } from "./fixture-derivation";

/** Demo-only scenario ids (never assignable to real transfer state). */
export type LabScenarioId = "exact-match" | "changed-amount" | "changed-recipient" | "extra-instruction" | "mutated-after-review";

export type LabScenario = Readonly<{
  id: LabScenarioId;
  title: string;
  summary: string;
  /** What the deliberately altered builder/wallet did. */
  tamper: string;
  core: boolean;
}>;

export const LAB_SCENARIOS: readonly LabScenario[] = [
  {
    id: "exact-match",
    title: "Exact match",
    summary: "The app's real builder compiles exactly the approved transfer.",
    tamper: "No tampering.",
    core: true,
  },
  {
    id: "changed-amount",
    title: "Changed amount",
    summary: "Approved 0.1 SOL; the unsigned transaction moves 0.8 SOL.",
    tamper: "A compromised builder multiplied the amount by 8.",
    core: true,
  },
  {
    id: "changed-recipient",
    title: "Changed recipient",
    summary: "Same first and last characters — different address in the middle.",
    tamper: "A lookalike recipient was swapped in (address-poisoning style).",
    core: true,
  },
  {
    id: "extra-instruction",
    title: "Extra instruction",
    summary: "The approved transfer plus a hidden second transfer.",
    tamper: "An additional System transfer to another account was appended.",
    core: false,
  },
  {
    id: "mutated-after-review",
    title: "Mutated after review",
    summary: "The reviewed bytes were edited before reaching the signing step.",
    tamper: "The lamports field was patched in place after verification.",
    core: false,
  },
];

const PARTIES = deriveDemoParties();
const LIFETIME = { blockhash: PARTIES.blockhash, lastValidBlockHeight: 0n };
const APPROVED_LAMPORTS = 100_000_000n; // 0.1 SOL

export const LAB_INTENT: IntentForVerification = Object.freeze({
  sender: PARTIES.sender,
  recipient: PARTIES.recipient,
  amountLamports: APPROVED_LAMPORTS,
  cluster: SUPPORTED_CHAIN,
});

/** Synthetic Devnet-format context: messages are never broadcast, so no RPC is involved. */
export const LAB_CONTEXT: VerificationContext = Object.freeze({ cluster: SUPPORTED_CHAIN, genesisHash: DEVNET_GENESIS_HASH });

export type LabRun = Readonly<{
  scenario: LabScenario;
  intent: IntentForVerification;
  reviewedFingerprint: string;
  messageBytes: Uint8Array;
  result: VerificationResult;
}>;

function compileTwoTransfers(): Uint8Array {
  const sender = PARTIES.sender as Address;
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayer(sender, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash({ blockhash: PARTIES.blockhash as Blockhash, lastValidBlockHeight: 0n }, m),
    (m) =>
      appendTransactionMessageInstructions(
        [
          getTransferSolInstruction({ source: createNoopSigner(sender), destination: PARTIES.recipient as Address, amount: APPROVED_LAMPORTS }),
          getTransferSolInstruction({ source: createNoopSigner(sender), destination: PARTIES.attacker as Address, amount: 500_000_000n }),
        ],
        m,
      ),
  );
  return Uint8Array.from(compileTransaction(message).messageBytes);
}

/**
 * Produce the scenario's unsigned message and run the SAME pure verifier used
 * by the real /app signing gate. Nothing is signed, simulated, or sent.
 */
export function runLabScenario(id: LabScenarioId, now: number = Date.now()): LabRun {
  const scenario = LAB_SCENARIOS.find((s) => s.id === id) ?? LAB_SCENARIOS[0]!;
  const reviewed = buildNativeSolTransfer(
    { sender: PARTIES.sender as Address, recipient: PARTIES.recipient as Address, amountLamports: APPROVED_LAMPORTS },
    LIFETIME,
    { now },
  );

  let messageBytes: Uint8Array = reviewed.messageBytes;
  let expectedFingerprint: string | null = null;

  switch (id) {
    case "changed-amount":
      messageBytes = buildNativeSolTransfer(
        { sender: PARTIES.sender as Address, recipient: PARTIES.recipient as Address, amountLamports: APPROVED_LAMPORTS * 8n },
        LIFETIME,
        { now },
      ).messageBytes;
      break;
    case "changed-recipient":
      messageBytes = buildNativeSolTransfer(
        { sender: PARTIES.sender as Address, recipient: PARTIES.lookalikeRecipient as Address, amountLamports: APPROVED_LAMPORTS },
        LIFETIME,
        { now },
      ).messageBytes;
      break;
    case "extra-instruction":
      messageBytes = compileTwoTransfers();
      break;
    case "mutated-after-review": {
      // Patch the u64 lamports (last 8 bytes) of the reviewed message in place.
      const patched = Uint8Array.from(reviewed.messageBytes);
      new DataView(patched.buffer).setBigUint64(patched.length - 8, APPROVED_LAMPORTS * 8n, true);
      messageBytes = patched;
      expectedFingerprint = reviewed.fingerprint;
      break;
    }
    default:
      break;
  }

  const result = verifyNativeSolTransfer({
    intent: LAB_INTENT,
    messageBytes,
    context: LAB_CONTEXT,
    expectedFingerprint,
    now,
  });

  return { scenario, intent: LAB_INTENT, reviewedFingerprint: reviewed.fingerprint, messageBytes, result };
}

export function labParties(): typeof PARTIES {
  return PARTIES;
}

export function fingerprintOf(bytes: Uint8Array): string {
  return fingerprintMessage(bytes);
}
