/**
 * UI-only demo domain (PRD §28.1). These types deliberately cannot be assigned
 * to the real TransferState / VerificationResult domain.
 */

export type DemoStatus = "idle" | "loading" | "success" | "warning" | "failed" | "unavailable";

export type DemoScenario = "exact-match" | "changed-amount" | "changed-recipient" | "network-unavailable";

export type DemoDifference = Readonly<{
  field: "recipient" | "amount" | "sender" | "feePayer" | "program" | "action" | "network" | "instructions";
  expected: string;
  actual: string | null;
  state: "changed" | "unsupported";
}>;

export type DemoDecoded = Readonly<{
  programId: string;
  sender: string;
  recipient: string;
  amountLamports: string;
  messageBytes: number;
}>;

export type DemoResult =
  | { source: "controlled-fixture"; status: "idle"; scenario: DemoScenario }
  | { source: "controlled-fixture"; status: "loading"; scenario: DemoScenario; requestId: number }
  | {
      source: "controlled-fixture";
      status: "success";
      scenario: DemoScenario;
      reasonCodes: string[];
      decoded: DemoDecoded | null;
      fingerprint: string;
    }
  | {
      source: "controlled-fixture";
      status: "warning";
      scenario: DemoScenario;
      reasonCodes: string[];
      decoded: DemoDecoded | null;
      differences: DemoDifference[];
      fingerprint: string;
    }
  | { source: "controlled-fixture"; status: "failed"; scenario: DemoScenario; message: string }
  | { source: "controlled-fixture"; status: "unavailable"; scenario: DemoScenario; message: string; detail?: string };

/** Never infer real status from a DemoResult (PRD §28.1). */
export type RealTransactionProvenance = Readonly<{
  source: "solana-devnet-rpc";
  cluster: "devnet";
  signature: string;
}>;
