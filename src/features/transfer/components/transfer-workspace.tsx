"use client";

import { RotateCcw, ShieldQuestion, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/misc";
import { IntentComposer } from "@/features/intent/components/intent-composer";
import { ActiveModelBadge } from "@/features/intent/components/model-switcher";
import { useAiModels } from "@/features/intent/hooks/use-ai-models";
import { IntentSummary } from "@/features/intent/components/intent-summary";
import { ManualTransferFields } from "@/features/intent/components/manual-transfer-fields";
import { validateDraft } from "@/features/intent/lib/intent-validation";
import type { ExplainRequest } from "@/features/intent/schema";
import { ReceiptCard } from "@/features/receipt/components/receipt-card";
import { AiExplanation } from "@/features/verification/components/ai-explanation";
import { TransactionInspector } from "@/features/verification/components/transaction-inspector";
import { formatLamportsAsSol } from "@/lib/format/sol";
import { useTransferMachine } from "../hooks/use-transfer-machine";
import { STATUS_COPY } from "../lib/status-copy";
import { isDraftEditable, isPostSubmit, type MachineState } from "../machine";
import { SigningGate } from "./signing-gate";
import { SimulationPanel } from "./simulation-panel";
import { TransactionStepper } from "./transaction-stepper";

const SIGN_BOUNDARY_CODES: ReadonlySet<string> = new Set([
  "MESSAGE_CHANGED",
  "UNEXPECTED_OUTPUT",
  "SIGNATURE_MISSING",
  "SIGNATURE_INVALID",
  "SIGNATURE_UNVERIFIABLE",
  "GATE_CLOSED",
]);

function explainSummary(state: MachineState): ExplainRequest | null {
  const { verification, approvedIntent, simulation } = state;
  if (!verification || !approvedIntent) return null;
  return {
    status: verification.status,
    reasons: [...verification.reasons],
    intendedAmountSol: approvedIntent.amountSol,
    actualAmountSol: verification.decoded ? formatLamportsAsSol(verification.decoded.amountLamports) : null,
    recipientMatches: verification.decoded ? verification.decoded.recipient === approvedIntent.recipient : null,
    simulation: simulation ? (simulation.ok ? "passed" : simulation.status === "failed" ? "failed" : "unavailable") : "not_run",
    simulationErrorCode: simulation?.errorCode ? simulation.errorCode.slice(0, 48) : null,
  };
}

function PanelHeading({ index, title, children }: { index: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-3">
      <h2 className="flex items-baseline gap-3 font-heading text-xl font-semibold tracking-[-0.01em] text-white">
        <span className="font-mono text-[0.8rem] text-mint">{index}</span>
        {title}
      </h2>
      {children}
    </div>
  );
}

export function TransferWorkspace() {
  const { state, wallet, online, devnet, approvalErrors, signAvailability, actions } = useTransferMachine();
  // Model choice feeds only the untrusted AI draft/explanation, never the verifier.
  const ai = useAiModels();
  const [touched, setTouched] = useState({ amountSol: false, recipient: false });

  const editable = isDraftEditable(state.status);
  const validation = validateDraft(state.draft, wallet.address);
  const fieldErrors = validation.errors;
  const showErrors = {
    amountSol: touched.amountSol || state.draft.source === "ai" || Boolean(approvalErrors),
    recipient: touched.recipient || state.draft.source === "ai" || Boolean(approvalErrors),
  };

  const approveHint = !wallet.address
    ? "Connect a Devnet wallet to continue."
    : devnet.state !== "verified"
      ? devnet.state === "checking"
        ? "Verifying the network is Solana Devnet…"
        : "The network could not be verified as Solana Devnet. Approval is disabled."
      : approvalErrors && "sender" in approvalErrors
        ? approvalErrors.sender
        : !validation.ok
          ? "Complete a valid amount and full recipient address to approve."
          : null;
  const canApprove = state.status === "DRAFT_READY" && Boolean(wallet.address) && devnet.state === "verified" && validation.ok;

  const aiDisabledReason = !online
    ? "AI help is offline while your browser is offline. Enter the details manually."
    : ai.status === "off"
      ? "AI drafting is not configured on this deployment. Enter the details manually."
      : null;
  const working = ["INTENT_APPROVED", "BUILDING", "VERIFYING", "SIMULATING"].includes(state.status);
  const summary = explainSummary(state);
  const blockedStates = ["BLOCKED", "UNABLE_TO_VERIFY", "SIMULATION_FAILED"];
  const postSubmit = isPostSubmit(state.status);
  // Explain every stop that the inspector/simulation panels do not already explain
  // (sign-boundary blocks, network/blockhash failures before verification).
  const stopAlert =
    state.error &&
    (state.status === "BLOCKED" || state.status === "UNABLE_TO_VERIFY") &&
    state.error.code !== "VERIFICATION_BLOCKED" &&
    state.error.code !== "UNABLE_TO_VERIFY" &&
    !(state.simulation && !state.simulation.ok)
      ? {
          title: SIGN_BOUNDARY_CODES.has(state.error.code)
            ? "Signing blocked at the wallet boundary — nothing was sent"
            : "Unable to Verify — signing disabled",
          message: state.error.message,
          code: state.error.code,
        }
      : null;

  return (
    <div className="grid gap-6 lg:grid-cols-12 lg:gap-8">
      {/* Left: describe + review (5/12) */}
      <div className="min-w-0 space-y-6 lg:col-span-5">
        <section className="hairline-panel space-y-5 p-5 sm:p-6" aria-label="Describe">
          <PanelHeading index="01" title="Describe">
            <ActiveModelBadge ai={ai} />
          </PanelHeading>
          <IntentComposer
            text={state.composerText}
            onTextChange={actions.setComposerText}
            onAnalyze={() => void actions.analyze(ai.selectedModel)}
            onManual={() => {
              actions.enterManually();
              document.getElementById("amount-sol")?.focus();
            }}
            parsing={state.status === "PARSING_INTENT"}
            disabled={!editable}
            aiDisabledReason={aiDisabledReason}
            notice={state.aiNotice}
            ai={ai}
          />
        </section>

        <section className="hairline-panel space-y-6 p-5 sm:p-6" aria-label="Review">
          <PanelHeading index="02" title="Review" />
          <ManualTransferFields
            amountSol={state.draft.amountSol}
            recipient={state.draft.recipient}
            source={state.draft.source}
            errors={fieldErrors}
            showErrors={showErrors}
            disabled={!editable}
            onChange={(field, value) => {
              setTouched((t) => ({ ...t, [field]: true }));
              actions.editDraft(field, value);
            }}
          />
          <IntentSummary
            sender={wallet.address}
            recipient={validation.ok ? validation.value.recipient : null}
            amountLamports={validation.ok ? validation.value.amountLamports : null}
            canApprove={canApprove}
            approveHint={approveHint}
            approved={state.approvedIntent !== null}
            onApprove={() => void actions.approve()}
          />
        </section>
      </div>

      {/* Right: verify, sign, confirm (7/12) */}
      <section className="hairline-panel min-w-0 space-y-6 p-5 sm:p-6 lg:col-span-7" aria-label="Verify, sign and confirm">
        <PanelHeading index="03" title="Verify · Sign · Confirm">
          <span className="type-caption">Real Devnet RPC</span>
        </PanelHeading>
        <TransactionStepper status={state.status} />

        <p aria-live="polite" className="flex items-start gap-2 text-[0.95rem] text-white">
          {working || state.status === "AWAITING_WALLET" || state.status === "CONFIRMING" || state.status === "SUBMITTED" ? (
            <Spinner />
          ) : null}
          <span>{STATUS_COPY[state.status]}</span>
        </p>

        {state.notice ? (
          <Alert tone="info" role="status" title={state.notice} />
        ) : null}
        {!online ? (
          <Alert tone="warning" role="alert" title="You are offline">
            AI help and signing are disabled until your connection returns.
          </Alert>
        ) : null}
        {devnet.state === "wrong-network" || devnet.state === "unavailable" || devnet.state === "misconfigured" ? (
          <Alert tone="danger" role="alert" title="Network not verified as Solana Devnet">
            {devnet.message}
          </Alert>
        ) : null}
        {wallet.address && (!wallet.supportsDevnet || !wallet.signer) ? (
          <Alert tone="warning" title="This wallet cannot be used for verified signing">
            {!wallet.supportsDevnet
              ? "The connected account does not advertise Solana Devnet."
              : "It does not support signing without broadcasting (solana:signTransaction), so the signed bytes could not be verified before sending."}
          </Alert>
        ) : null}

        {stopAlert ? (
          <Alert tone="danger" role="alert" title={stopAlert.title}>
            {stopAlert.message}{" "}
            <code className="font-mono text-[0.75rem] text-muted">{stopAlert.code}</code>
          </Alert>
        ) : null}

        {!state.approvedIntent && !postSubmit ? (
          <div className="flex flex-col items-center gap-3 rounded-[var(--radius-control)] border border-dashed border-hairline px-6 py-10 text-center">
            <ShieldQuestion className="size-8 text-muted" aria-hidden />
            <p className="max-w-md text-[0.95rem] text-silver">
              Approve an intent to inspect the exact transaction your wallet will be asked to sign. Nothing is built before
              you approve.
            </p>
          </div>
        ) : null}

        {working && !state.verification ? (
          <ol className="space-y-2 text-[0.9rem]" aria-label="Preparation steps">
            <li className="flex items-center gap-2 text-white">
              <Spinner /> {state.prepared ? "Final message compiled." : "Fetching a recent blockhash and compiling the final message…"}
            </li>
            <li className="text-muted">Decode + compare against your approval</li>
            <li className="text-muted">Simulate on Devnet</li>
          </ol>
        ) : null}

        {state.verification ? (
          <TransactionInspector result={state.verification} messageBytes={state.prepared?.messageBytes ?? null} />
        ) : null}

        {state.verification?.ok ? <SimulationPanel running={state.status === "SIMULATING"} result={state.simulation} /> : null}

        {summary && state.verification ? (
          <AiExplanation
            summary={summary}
            verdictKey={`${state.verification.messageFingerprint}:${state.verification.status}:${state.simulation?.status ?? "none"}`}
            disabledReason={
              !online ? "Unavailable while offline." : ai.status === "off" ? "AI is not configured on this deployment." : null
            }
            model={ai.selectedModel}
            labelFor={ai.labelFor}
          />
        ) : null}

        {blockedStates.includes(state.status) ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" onClick={actions.reviewAgain}>
              <RotateCcw className="size-4" aria-hidden /> Review again
            </Button>
            <p className="type-caption">Signing stays disabled for this approval. Reviewing again rebuilds and rechecks everything.</p>
          </div>
        ) : null}

        {state.approvedIntent && !postSubmit && !blockedStates.includes(state.status) ? (
          <SigningGate
            status={state.status}
            available={signAvailability.ok}
            reason={signAvailability.ok ? null : signAvailability.reason}
            error={state.error}
            onSign={() => void actions.sign()}
            onReviewAgain={actions.reviewAgain}
          />
        ) : null}

        {state.receipt ? (
          <ReceiptCard
            data={{
              status: state.receipt.status,
              signature: state.receipt.signature,
              amountLamports: state.receipt.amountLamports,
              sender: state.receipt.sender,
              recipient: state.receipt.recipient,
              feeLamports: state.receipt.feeLamports,
              blockTime: state.receipt.blockTime,
              slot: state.receipt.slot,
              confirmationStatus: state.receipt.confirmationStatus,
              error: state.receipt.error,
            }}
          />
        ) : null}

        {state.status === "UNKNOWN" ? (
          <Alert tone="warning" role="alert" title="Do not resend blindly">
            <span className="inline-flex items-start gap-1.5">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              The previous transaction may still land. Check the explorer link above before approving a new transfer.
            </span>
          </Alert>
        ) : null}

        {["CONFIRMED", "ONCHAIN_FAILED", "EXPIRED", "UNKNOWN"].includes(state.status) ? (
          <Button variant="secondary" onClick={actions.reset}>
            Start a new transfer
          </Button>
        ) : null}
      </section>
    </div>
  );
}
