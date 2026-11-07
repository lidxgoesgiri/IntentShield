import { COMPUTE_BUDGET_PROGRAM_ADDRESS, LIGHTHOUSE_PROGRAM_ADDRESS } from "@/config/product";
import { decodeTransactionMessage } from "./decode-transaction";

const KNOWN_PROGRAMS: Readonly<Record<string, string>> = {
  [COMPUTE_BUDGET_PROGRAM_ADDRESS]: "Compute Budget (priority fee) instructions",
  [LIGHTHOUSE_PROGRAM_ADDRESS]: "Lighthouse safety assertions",
};

function label(programId: string): string {
  return KNOWN_PROGRAMS[programId] ?? `instructions for program ${programId.slice(0, 4)}…${programId.slice(-4)}`;
}

function countPrograms(ids: readonly (string | null)[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const id of ids) {
    const key = id ?? "unknown";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/**
 * Plain-language summary of how a wallet changed the reviewed message, for the
 * MESSAGE_CHANGED error. Display only: the decision to refuse is made by the
 * byte comparison, never by this description.
 */
export function describeMessageChange(reviewed: ArrayLike<number>, returned: ArrayLike<number>): string {
  const before = decodeTransactionMessage(reviewed);
  const after = decodeTransactionMessage(returned);
  if (!before.ok || !after.ok) return "it returned a transaction IntentShield cannot decode";

  const parts: string[] = [];
  const beforeCounts = countPrograms(before.message.instructions.map((ix) => ix.programId));
  const afterCounts = countPrograms(after.message.instructions.map((ix) => ix.programId));
  const added = [...afterCounts].filter(([id, count]) => count > (beforeCounts.get(id) ?? 0)).map(([id]) => label(id));
  const removed = [...beforeCounts].filter(([id, count]) => count > (afterCounts.get(id) ?? 0)).map(([id]) => label(id));

  if (added.length > 0) parts.push(`added ${added.join(" and ")}`);
  if (removed.length > 0) parts.push(`removed ${removed.join(" and ")}`);
  if (before.message.lifetimeToken !== after.message.lifetimeToken) parts.push("replaced the blockhash");
  if (parts.length === 0) parts.push("changed the instruction contents");
  return `it ${parts.join(", ")}`;
}
