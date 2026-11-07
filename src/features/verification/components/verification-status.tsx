import { Alert } from "@/components/ui/alert";
import { describeReasons } from "../lib/verification-reasons";
import type { VerificationResult } from "../types";

/**
 * Deterministic verdict banner: Intent Matched / Verification Failed /
 * Unable to Verify — never an absolute "Safe" badge (PRD principle 9).
 */
export function VerificationStatus({ result }: { result: VerificationResult }) {
  if (result.status === "matched") {
    return (
      <Alert tone="success" role="status" title="Intent Matched">
        Every supported field of the exact message matches your approved intent. Matching intent does not prove the
        destination is trustworthy.
      </Alert>
    );
  }
  const reasons = describeReasons(result.reasons);
  return (
    <Alert
      tone={result.status === "blocked" ? "danger" : "warning"}
      role="alert"
      title={result.status === "blocked" ? "Verification Failed — signing disabled" : "Unable to Verify — signing disabled"}
    >
      <ul className="mt-1 space-y-1.5">
        {reasons.map((reason) => (
          <li key={reason.code}>
            <span className="font-medium text-white">{reason.title}.</span> {reason.detail}{" "}
            <code className="font-mono text-[0.8125rem] text-muted">{reason.code}</code>
          </li>
        ))}
      </ul>
    </Alert>
  );
}
