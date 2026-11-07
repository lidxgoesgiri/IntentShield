import { describe, expect, it } from "vitest";
import { approveIntent, validateDraft, validateRecipient } from "@/features/intent/lib/intent-validation";
import { RECIPIENT, SENDER } from "@/test/fixtures/solana";

describe("validateRecipient (PRD FR-003, UT-05/UT-06)", () => {
  it("UT-05: accepts a valid base58 32-byte public key", () => {
    expect(validateRecipient(RECIPIENT)).toEqual({ ok: true, address: RECIPIENT });
    expect(validateRecipient(`  ${RECIPIENT}  `)).toEqual({ ok: true, address: RECIPIENT });
  });

  it.each([
    ["Budi"],
    ["0x1234567890abcdef1234567890abcdef12345678"],
    [`${RECIPIENT}x`],
    [RECIPIENT.slice(0, 20)],
    [RECIPIENT.replace(/.$/, "0")], // '0' is not in the base58 alphabet
    ["11111111111111111111111111111111111111111111111"],
    [`${RECIPIENT.slice(0, 10)} ${RECIPIENT.slice(10)}`],
    ["<script>alert(1)</script>"],
  ])("UT-05: rejects malformed address %j", (input) => {
    expect(validateRecipient(input)).toEqual({ ok: false, error: "INVALID_ADDRESS" });
  });

  it("treats a one-character-truncated string as a different key, never as the original", () => {
    // Base58 public keys are 32–44 chars, so truncation can yield another *valid*
    // key. This is why the verifier compares full addresses exactly.
    const truncated = RECIPIENT.slice(0, -1);
    const result = validateRecipient(truncated);
    if (result.ok) expect(result.address).not.toBe(RECIPIENT);
    else expect(result.error).toBe("INVALID_ADDRESS");
  });

  it("rejects empty input with the 'we won't guess' copy path", () => {
    expect(validateRecipient("")).toEqual({ ok: false, error: "EMPTY" });
  });

  it("UT-06: rejects sending to the connected wallet itself", () => {
    expect(validateRecipient(SENDER, SENDER)).toEqual({ ok: false, error: "SAME_AS_SENDER" });
  });
});

describe("validateDraft / approveIntent (PRD FR-004)", () => {
  it("returns exact lamports for a valid draft", () => {
    const result = validateDraft({ amountSol: "0.1", recipient: RECIPIENT }, SENDER);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.amountLamports).toBe(100_000_000n);
  });

  it("collects field errors for both fields", () => {
    const result = validateDraft({ amountSol: "1e-9", recipient: "Budi" }, SENDER);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.amountSol).toBeTruthy();
      expect(result.errors.recipient).toBeTruthy();
    }
  });

  it("requires a connected sender wallet", () => {
    const result = approveIntent({ amountSol: "0.1", recipient: RECIPIENT }, null);
    expect(result.ok).toBe(false);
  });

  it("produces a frozen, immutable approval bound to exact values", () => {
    const result = approveIntent({ amountSol: "0.10", recipient: RECIPIENT }, SENDER, 1_700_000_000_000);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.intent).toMatchObject({
      kind: "native_sol_transfer",
      sender: SENDER,
      recipient: RECIPIENT,
      amountLamports: 100_000_000n,
      amountSol: "0.1",
      cluster: "solana:devnet",
      approvedAt: 1_700_000_000_000,
    });
    expect(Object.isFrozen(result.intent)).toBe(true);
    expect(() => {
      (result.intent as { amountLamports: bigint }).amountLamports = 800_000_000n;
    }).toThrow();
  });

  it("issues a unique approval id per approval", () => {
    const a = approveIntent({ amountSol: "0.1", recipient: RECIPIENT }, SENDER);
    const b = approveIntent({ amountSol: "0.1", recipient: RECIPIENT }, SENDER);
    expect(a.ok && b.ok && a.intent.approvalId !== b.intent.approvalId).toBe(true);
  });
});
