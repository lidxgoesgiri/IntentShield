import { DEMO_MESSAGES_BASE64, DEMO_PARTIES } from "./demo-fixtures.generated";
import type { DemoScenario } from "./types";

/** Explicitly labeled demo fixtures (PRD §14 rule 12: demo data lives here). */
export const DEMO_INTENT = Object.freeze({
  sender: DEMO_PARTIES.sender,
  recipient: DEMO_PARTIES.recipient,
  amountLamports: 100_000_000n,
  amountSol: "0.1",
  cluster: "solana:devnet",
});

export type DemoScenarioInfo = Readonly<{
  id: DemoScenario;
  label: string;
  description: string;
  /** base64 unsigned message bytes, or null when the scenario has no message. */
  messageBase64: string | null;
  proposedSummary: string;
  optional?: boolean;
}>;

export const DEMO_SCENARIOS: readonly DemoScenarioInfo[] = [
  {
    id: "exact-match",
    label: "Exact Match",
    description: "The unsigned transaction does exactly what the sample intent says.",
    messageBase64: DEMO_MESSAGES_BASE64.exactMatch,
    proposedSummary: "System transfer · 0.1 SOL to the approved recipient",
  },
  {
    id: "changed-amount",
    label: "Changed Amount",
    description: "Approved 0.1 SOL, but the unsigned transaction moves 0.8 SOL.",
    messageBase64: DEMO_MESSAGES_BASE64.changedAmount,
    proposedSummary: "System transfer · amount altered by the builder",
  },
  {
    id: "changed-recipient",
    label: "Changed Recipient",
    description: "Same first and last characters — a different address in the middle.",
    messageBase64: DEMO_MESSAGES_BASE64.changedRecipient,
    proposedSummary: "System transfer · recipient swapped for a lookalike",
  },
  {
    id: "network-unavailable",
    label: "RPC Unreachable",
    description: "Simulates an unreachable Solana RPC to show the fail-closed fallback.",
    messageBase64: null,
    proposedSummary: "No conclusion possible without the network",
    optional: true,
  },
];

export function scenarioInfo(id: DemoScenario): DemoScenarioInfo {
  return DEMO_SCENARIOS.find((s) => s.id === id) ?? DEMO_SCENARIOS[0]!;
}
