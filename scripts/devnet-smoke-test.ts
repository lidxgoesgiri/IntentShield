/**
 * IntentShield — live Solana Devnet smoke test (PRD §19.3 #10, §25).
 *
 * Runs the SAME production modules the web app uses:
 *   approveIntent → runPreSignPipeline (Devnet guard, build, verify, preflight,
 *   simulate) → signVerifiedTransfer (sign boundary) → submitSignedTransfer →
 *   waitForConfirmation → re-verify the on-chain transaction bytes.
 *
 * Keys: the SENDER is a disposable, test-only Devnet keypair kept at
 * `.devnet/smoke-test-keypair.json` (git-ignored, created on first run, never
 * printed). The RECIPIENT is a fresh in-memory keypair each run. Funds are
 * Devnet SOL, which has no monetary value. The public RPC faucet
 * (`requestAirdrop`) is tried first; it currently answers HTTP 410, so fund the
 * printed sender address at https://faucet.solana.com and rerun.
 *
 * Usage:  npm run smoke:devnet
 * Env:    NEXT_PUBLIC_SOLANA_RPC_URL (default https://api.devnet.solana.com)
 *         SMOKE_KEYPAIR_PATH (default .devnet/smoke-test-keypair.json)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  createKeyPairSignerFromBytes,
  createSignerFromKeyPair,
  createSolanaRpc,
  generateKeyPair,
  generateKeyPairSigner,
  writeKeyPair,
  getBase64Encoder,
  getTransactionDecoder,
  lamports,
  partiallySignTransaction,
  type Transaction,
} from "@solana/kit";
import { approveIntent } from "../src/features/intent/lib/intent-validation";
import { buildNativeSolTransfer } from "../src/features/transfer/lib/build-transfer";
import { waitForConfirmation } from "../src/features/transfer/lib/confirm-transfer";
import { runPreSignPipeline } from "../src/features/transfer/lib/prepare-transfer";
import { signVerifiedTransfer, type TransactionSignerPort } from "../src/features/transfer/lib/sign-transfer";
import { submitSignedTransfer } from "../src/features/transfer/lib/submit-transfer";
import { verifyNativeSolTransfer } from "../src/features/verification/lib/verify-native-sol-transfer";
import { formatLamportsAsSol } from "../src/lib/format/sol";
import { checkDevnet } from "../src/lib/solana/network";
import { createSolanaRpcPort } from "../src/lib/solana/rpc";

const RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com";
const AIRDROP_LAMPORTS = 500_000_000n; // 0.5 Devnet SOL
const TRANSFER_SOL = "0.01";
const MIN_SENDER_LAMPORTS = 20_000_000n; // transfer + fees headroom
const KEYPAIR_PATH = process.env.SMOKE_KEYPAIR_PATH || join(process.cwd(), ".devnet", "smoke-test-keypair.json");

/** Load the disposable Devnet test sender, creating it on first run. */
async function loadOrCreateTestSender() {
  if (existsSync(KEYPAIR_PATH)) {
    const bytes = Uint8Array.from(JSON.parse(readFileSync(KEYPAIR_PATH, "utf8")) as number[]);
    return { signer: await createKeyPairSignerFromBytes(bytes), created: false };
  }
  mkdirSync(dirname(KEYPAIR_PATH), { recursive: true });
  const keyPair = await generateKeyPair(true);
  await writeKeyPair(keyPair, KEYPAIR_PATH);
  return { signer: await createSignerFromKeyPair(keyPair), created: true };
}

type Step = { step: string; ok: boolean; detail: string; at: string };
const steps: Step[] = [];
function record(step: string, ok: boolean, detail: string) {
  steps.push({ step, ok, detail, at: new Date().toISOString() });
  console.log(`${ok ? "✔" : "✘"} ${step} — ${detail}`);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log(`IntentShield Devnet smoke test · RPC ${RPC_URL}\n`);
  const rpcPort = createSolanaRpcPort(RPC_URL, 20_000);
  const rawRpc = createSolanaRpc(RPC_URL);

  const network = await checkDevnet(rpcPort);
  if (!network.ok) {
    record("Devnet guard", false, `${network.message} (${network.cause ?? network.reason})`);
    return finish(1);
  }
  record("Devnet guard", true, `genesis hash ${network.context.genesisHash}`);

  const { signer: sender, created } = await loadOrCreateTestSender();
  const recipient = await generateKeyPairSigner();
  record(
    "Test keys",
    true,
    `sender ${sender.address} (${created ? "new" : "existing"} test-only Devnet key, git-ignored) · recipient ${recipient.address} (in-memory)`,
  );

  // Fund the sender if needed (Devnet SOL has no monetary value).
  let funded = (await rpcPort.getBalance(sender.address)) >= MIN_SENDER_LAMPORTS;
  if (funded) record("Sender balance", true, `${formatLamportsAsSol(await rpcPort.getBalance(sender.address))} SOL available`);
  for (let attempt = 1; attempt <= 2 && !funded; attempt += 1) {
    try {
      await rawRpc.requestAirdrop(sender.address, lamports(AIRDROP_LAMPORTS), { commitment: "confirmed" }).send();
      for (let i = 0; i < 30; i += 1) {
        const balance = await rpcPort.getBalance(sender.address);
        if (balance >= MIN_SENDER_LAMPORTS) {
          funded = true;
          record("Devnet faucet", true, `airdrop ${formatLamportsAsSol(balance)} SOL received (attempt ${attempt})`);
          break;
        }
        await sleep(2000);
      }
    } catch (error) {
      record("Devnet faucet", false, `attempt ${attempt}: ${error instanceof Error ? error.message : String(error)}`);
      await sleep(4000 * attempt);
    }
  }
  if (!funded) {
    record(
      "Devnet faucet",
      false,
      `Faucet unavailable. Fund ${sender.address} with ≥0.05 Devnet SOL at https://faucet.solana.com, then rerun npm run smoke:devnet.`,
    );
    return finish(2, { fundAddress: sender.address });
  }

  // 1. Approved intent (same validation as the UI).
  const approval = approveIntent({ amountSol: TRANSFER_SOL, recipient: recipient.address }, sender.address);
  if (!approval.ok) {
    record("Approve intent", false, JSON.stringify(approval.errors));
    return finish(1);
  }
  const intent = approval.intent;
  record("Approve intent", true, `${intent.amountSol} SOL (${intent.amountLamports} lamports) → ${intent.recipient}`);

  // 2. Negative control on the live Devnet context: an altered message must be blocked.
  const blockhash = await rpcPort.getLatestBlockhash();
  const tampered = buildNativeSolTransfer(
    { sender: intent.sender, recipient: intent.recipient, amountLamports: intent.amountLamports * 8n },
    blockhash,
  );
  const tamperedResult = verifyNativeSolTransfer({ intent, messageBytes: tampered.messageBytes, context: network.context });
  record(
    "Negative control (amount ×8)",
    tamperedResult.status === "blocked" && tamperedResult.reasons.includes("AMOUNT_MISMATCH"),
    `verifier → ${tamperedResult.status} [${tamperedResult.reasons.join(", ")}] (never signed or sent)`,
  );

  // 3. Pre-sign pipeline exactly as in /app.
  const outcome = await runPreSignPipeline(rpcPort, intent, {
    onEvent: (event) => {
      if (event.type === "verification_completed") {
        console.log(`   · verification: ${event.result.status} ${event.result.messageFingerprint}`);
      }
      if (event.type === "simulation_completed") {
        console.log(`   · simulation: ${event.result.status} (${event.result.unitsConsumed ?? "?"} CU, fee ${event.result.feeLamports ?? "?"} lamports)`);
      }
    },
  });
  if (outcome.kind !== "ready") {
    record("Pre-sign pipeline", false, JSON.stringify(outcome, (_k, v: unknown) => (typeof v === "bigint" ? v.toString() : v)).slice(0, 400));
    return finish(1);
  }
  record("Pre-sign pipeline", true, `matched + simulation passed · ${outcome.prepared.fingerprint}`);

  // 4. Sign boundary with a local signer standing in for the browser wallet.
  const localSigner: TransactionSignerPort = {
    modifyAndSignTransactions: async (transactions) =>
      Promise.all(transactions.map((tx) => partiallySignTransaction([sender.keyPair], tx as Transaction))),
  };
  const signed = await signVerifiedTransfer({
    intent,
    prepared: outcome.prepared,
    verification: outcome.verification,
    simulation: outcome.simulation,
    context: outcome.context,
    signer: localSigner,
  });
  record("Sign boundary", true, `bytes unchanged + Ed25519 signature verified · ${signed.signature}`);

  // 5. Broadcast once, then poll for confirmation.
  const submitted = await submitSignedTransfer(rpcPort, signed, outcome.prepared.lifetime.lastValidBlockHeight);
  if (submitted.kind !== "submitted" && submitted.kind !== "unknown") {
    record("Submit", false, `${submitted.kind}: ${"message" in submitted ? submitted.message : ""}`);
    return finish(1);
  }
  record("Submit", true, `status SUBMITTED (not yet confirmed) · ${submitted.signature}`);

  const confirmation = await waitForConfirmation(
    rpcPort,
    { signature: signed.signature, lastValidBlockHeight: outcome.prepared.lifetime.lastValidBlockHeight },
    { onUpdate: (u) => console.log(`   · status: ${u.status} (${u.confirmationStatus ?? "not seen"})`) },
  );
  record("Confirmation", confirmation.status === "confirmed", `${confirmation.status} at slot ${confirmation.slot ?? "?"}`);
  if (confirmation.status !== "confirmed") return finish(1);

  // 6. Re-verify what actually landed on chain.
  const onChain = await rpcPort.getTransaction(signed.signature);
  if (!onChain) {
    record("On-chain re-verification", false, "getTransaction returned null");
    return finish(1);
  }
  const decodedTx = getTransactionDecoder().decode(getBase64Encoder().encode(onChain.wireBase64));
  const onChainCheck = verifyNativeSolTransfer({
    intent,
    messageBytes: decodedTx.messageBytes,
    context: network.context,
    expectedFingerprint: signed.signedMessageFingerprint,
  });
  record(
    "On-chain re-verification",
    onChainCheck.ok && onChain.err === null,
    `on-chain message ${onChainCheck.status}; meta.err=${JSON.stringify(onChain.err)}; fee ${onChain.fee} lamports; blockTime ${onChain.blockTime}`,
  );

  const explorer = `https://explorer.solana.com/tx/${signed.signature}?cluster=devnet`;
  console.log(`\nExplorer: ${explorer}`);
  return finish(onChainCheck.ok ? 0 : 1, {
    signature: signed.signature,
    explorer,
    slot: onChain.slot.toString(),
    blockTime: onChain.blockTime?.toString() ?? null,
    feeLamports: onChain.fee?.toString() ?? null,
    amountLamports: intent.amountLamports.toString(),
    sender: intent.sender,
    recipient: intent.recipient,
  });
}

function finish(code: number, evidence: Record<string, unknown> = {}) {
  const dir = join(process.cwd(), "artifacts");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `devnet-smoke-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(file, JSON.stringify({ rpc: RPC_URL, exitCode: code, steps, evidence }, null, 2));
  console.log(`\nEvidence written to ${file}`);
  process.exitCode = code;
}

main().catch((error: unknown) => {
  record("Unhandled error", false, error instanceof Error ? `${error.name}: ${error.message}` : String(error));
  finish(1);
});
