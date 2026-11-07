/**
 * Synchronous guard against double-clicks (PRD UT-19): React state updates are
 * asynchronous, so two clicks in the same frame could both pass a state check.
 * Each approval id can acquire the lock exactly once, ever.
 */
export function createSigningLock() {
  const used = new Set<string>();
  let inFlight: string | null = null;
  return {
    acquire(approvalId: string): boolean {
      if (inFlight !== null || used.has(approvalId)) return false;
      used.add(approvalId);
      inFlight = approvalId;
      return true;
    },
    release(approvalId: string): void {
      if (inFlight === approvalId) inFlight = null;
    },
    isLocked(): boolean {
      return inFlight !== null;
    },
  };
}
