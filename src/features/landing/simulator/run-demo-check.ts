import { DEVNET_GENESIS_HASH, SUPPORTED_CHAIN } from "@/config/product";
import { DEMO_INTENT, scenarioInfo } from "./demo-scenarios";
import type { DemoDifference, DemoResult, DemoScenario } from "./types";

export type VerifierModule = typeof import("./verifier-entry");

export type DemoCheckOptions = Readonly<{
  /** Injectable for tests (e.g. a throwing or missing verifier). */
  loadVerifier?: () => Promise<VerifierModule>;
  timeoutMs?: number;
  signal?: AbortSignal;
}>;

const defaultLoader = () => import("./verifier-entry");

/** The demo context mirrors a verified Devnet context; fixtures never touch RPC. */
const DEMO_CONTEXT = { cluster: SUPPORTED_CHAIN, genesisHash: DEVNET_GENESIS_HASH } as const;

/**
 * Run one controlled check: decode the fixture bytes with the shared pure
 * verifier and map its verdict onto demo states. No wallet, RPC, signing, or
 * broadcasting can happen here (PRD §28, LP-11). No artificial delay is added.
 */
export async function runDemoCheck(scenario: DemoScenario, options: DemoCheckOptions = {}): Promise<Exclude<DemoResult, { status: "idle" | "loading" }>> {
  const info = scenarioInfo(scenario);

  let verifier: VerifierModule;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const load = options.loadVerifier ?? defaultLoader;
    const timeoutMs = options.timeoutMs ?? 8_000;
    verifier = await Promise.race([
      load(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("verifier load timeout")), timeoutMs);
      }),
    ]);
  } catch {
    clearTimeout(timer);
    return {
      source: "controlled-fixture",
      status: "unavailable",
      scenario,
      message: "Demo verification is currently unavailable. Try again later.",
    };
  }
  clearTimeout(timer);
  options.signal?.throwIfAborted();

  if (info.messageBase64 === null) {
    // Optional scenario: the network dependency is (deliberately) unreachable.
    return {
      source: "controlled-fixture",
      status: "unavailable",
      scenario,
      message: "Demo verification is currently unavailable. Try again later.",
      detail:
        "This sample simulates an unreachable Solana RPC. With no network answer there is no conclusion — the real app shows “Unable to Verify” and keeps signing disabled.",
    };
  }

  try {
    const bytes = Uint8Array.from(verifier.getBase64Encoder().encode(info.messageBase64));
    const result = verifier.verifyNativeSolTransfer({ intent: DEMO_INTENT, messageBytes: bytes, context: DEMO_CONTEXT });
    const decoded = result.decoded
      ? {
          programId: result.decoded.programId,
          sender: result.decoded.sender,
          recipient: result.decoded.recipient,
          amountLamports: result.decoded.amountLamports.toString(),
          messageBytes: bytes.length,
        }
      : null;

    if (result.status === "matched") {
      return {
        source: "controlled-fixture",
        status: "success",
        scenario,
        reasonCodes: [],
        decoded,
        fingerprint: result.messageFingerprint,
      };
    }
    if (result.status === "blocked") {
      const differences: DemoDifference[] = result.comparisons
        .filter((row) => row.state !== "match")
        .map((row) => ({ field: row.field, expected: row.expected, actual: row.actual, state: row.state === "changed" ? "changed" : "unsupported" }));
      return {
        source: "controlled-fixture",
        status: "warning",
        scenario,
        reasonCodes: [...result.reasons],
        decoded,
        differences,
        fingerprint: result.messageFingerprint,
      };
    }
    return {
      source: "controlled-fixture",
      status: "failed",
      scenario,
      message: "Demo check could not complete. No security conclusion was produced.",
    };
  } catch {
    return {
      source: "controlled-fixture",
      status: "failed",
      scenario,
      message: "Demo check could not complete. No security conclusion was produced.",
    };
  }
}
