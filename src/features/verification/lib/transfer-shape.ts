import {
  COMPUTE_BUDGET_PROGRAM_ADDRESS,
  SYSTEM_PROGRAM_ADDRESS,
  TRANSFER_COMPUTE_UNIT_LIMIT,
  TRANSFER_COMPUTE_UNIT_PRICE_MICRO_LAMPORTS,
} from "@/config/product";
import { parseComputeBudgetData, parseSystemTransferData, type DecodedInstruction } from "./decode-transaction";

/**
 * The only two instruction layouts a supported transfer may have:
 *   1. [System Transfer]
 *   2. [SetComputeUnitLimit(1,000), SetComputeUnitPrice(1), System Transfer]
 * Layout 2 is what the app builds. Compute Budget instructions are accepted
 * only with exactly the fixed values, no accounts, and before the transfer, so
 * a builder or wallet cannot raise the fee through them.
 */
export type TransferShape =
  | Readonly<{ ok: true; transfer: DecodedInstruction; computeBudget: boolean }>
  | Readonly<{ ok: false; transfer: DecodedInstruction | null }>;

export function isSystemTransferInstruction(instruction: DecodedInstruction): boolean {
  return instruction.programId === SYSTEM_PROGRAM_ADDRESS && parseSystemTransferData(instruction.data) !== null;
}

function isFixedUnitLimit(instruction: DecodedInstruction | undefined): boolean {
  if (!instruction || instruction.programId !== COMPUTE_BUDGET_PROGRAM_ADDRESS || instruction.accounts.length !== 0) {
    return false;
  }
  const parsed = parseComputeBudgetData(instruction.data);
  return parsed?.kind === "unitLimit" && parsed.units === TRANSFER_COMPUTE_UNIT_LIMIT;
}

function isFixedUnitPrice(instruction: DecodedInstruction | undefined): boolean {
  if (!instruction || instruction.programId !== COMPUTE_BUDGET_PROGRAM_ADDRESS || instruction.accounts.length !== 0) {
    return false;
  }
  const parsed = parseComputeBudgetData(instruction.data);
  return parsed?.kind === "unitPrice" && parsed.microLamports === TRANSFER_COMPUTE_UNIT_PRICE_MICRO_LAMPORTS;
}

/**
 * Classify the instruction list. `ok` only says the layout is allowed; the
 * transfer itself (program, accounts, amount) is still checked by the caller.
 */
export function matchTransferShape(instructions: readonly DecodedInstruction[]): TransferShape {
  const [first, second, third] = instructions;
  if (instructions.length === 1 && first) return { ok: true, transfer: first, computeBudget: false };
  if (instructions.length === 3 && third && isFixedUnitLimit(first) && isFixedUnitPrice(second)) {
    return { ok: true, transfer: third, computeBudget: true };
  }
  return { ok: false, transfer: instructions.find(isSystemTransferInstruction) ?? first ?? null };
}
