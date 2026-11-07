import { Activity } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Disclosure, Spinner } from "@/components/ui/misc";
import { formatLamportsAsSol } from "@/lib/format/sol";
import type { SimulationResult } from "../types";

/** SimulationPanel states: idle, running, passed, failed, timeout/unavailable (PRD §12). */
export function SimulationPanel({ running, result }: { running: boolean; result: SimulationResult | null }) {
  return (
    <section aria-labelledby="simulation-heading" className="space-y-3">
      <h3 id="simulation-heading" className="flex items-center gap-2 font-display text-lg font-semibold text-white">
        <Activity className="size-4 text-muted" aria-hidden /> Devnet simulation
      </h3>
      {running ? (
        <p className="text-[0.925rem] text-silver" role="status">
          <Spinner label="Simulating the exact transaction on Solana Devnet…" />
        </p>
      ) : null}
      {!running && !result ? (
        <p className="type-caption">Runs only after the exact message matches your intent. Both gates must pass.</p>
      ) : null}
      {result ? (
        <>
          {result.ok ? (
            <Alert tone="success" role="status" title="Simulation passed on Solana Devnet">
              The RPC executed this exact unsigned message without errors (signature verification skipped, blockhash unchanged).
            </Alert>
          ) : (
            <Alert
              tone={result.status === "failed" ? "danger" : "warning"}
              role="alert"
              title={result.status === "failed" ? "Simulation failed — signing disabled" : "Simulation unavailable — signing disabled"}
            >
              {result.error}
              {result.errorCode ? <code className="ml-2 font-mono text-[0.75rem] text-muted">{result.errorCode}</code> : null}
            </Alert>
          )}
          <dl className="grid grid-cols-2 gap-3 text-[0.85rem] sm:grid-cols-3">
            <Stat label="Network fee" value={result.feeLamports !== undefined ? `${formatLamportsAsSol(result.feeLamports)} SOL` : "—"} />
            <Stat label="Balance (RPC)" value={result.balanceLamports !== undefined ? `${formatLamportsAsSol(result.balanceLamports)} SOL` : "—"} />
            <Stat label="Compute units" value={result.unitsConsumed !== undefined ? result.unitsConsumed.toString() : "—"} />
          </dl>
          {result.logs.length > 0 ? (
            <Disclosure summary={`Simulation logs (${result.logs.length})`}>
              <pre className="font-data max-h-48 overflow-auto whitespace-pre-wrap text-[0.8rem] text-muted">{result.logs.join("\n")}</pre>
            </Disclosure>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-control)] border border-hairline px-3 py-2.5">
      <dt className="type-caption">{label}</dt>
      <dd className="font-data mt-0.5 text-white">{value}</dd>
    </div>
  );
}
