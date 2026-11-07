import { isAddress } from "@solana/kit";
import { describe, expect, it } from "vitest";
import { deriveDemoParties, deriveLookalikeAddress } from "@/features/demo/lib/fixture-derivation";
import { LAB_SCENARIOS, runLabScenario } from "@/features/demo/lib/scenarios";
import { DEMO_MESSAGES_BASE64, DEMO_PARTIES } from "@/features/landing/simulator/demo-fixtures.generated";
import { countChangedCharacters } from "@/lib/format/address";
import { buildLandingFixtures } from "../../scripts/generate-demo-fixtures";

describe("controlled demo fixtures (PRD §28.3)", () => {
  it("committed landing fixtures equal the production builder output (no hand-crafted bytes)", () => {
    const fresh = buildLandingFixtures();
    // The landing ships only the parties it displays (no "attacker" account).
    expect(DEMO_PARTIES).toEqual({
      sender: fresh.parties.sender,
      recipient: fresh.parties.recipient,
      lookalikeRecipient: fresh.parties.lookalikeRecipient,
      blockhash: fresh.parties.blockhash,
    });
    expect(DEMO_MESSAGES_BASE64).toEqual(fresh.messages);
  });

  it("uses valid, distinct, SHA-256-derived sample addresses", () => {
    const parties = deriveDemoParties();
    for (const value of Object.values(parties)) expect(isAddress(value)).toBe(true);
    expect(new Set(Object.values(parties)).size).toBe(Object.values(parties).length);
  });

  it("the lookalike shares prefix and suffix and differs only in a few middle characters", () => {
    const { recipient, lookalikeRecipient } = deriveDemoParties();
    expect(lookalikeRecipient).not.toBe(recipient);
    expect(lookalikeRecipient.slice(0, 12)).toBe(recipient.slice(0, 12));
    expect(lookalikeRecipient.slice(-12)).toBe(recipient.slice(-12));
    expect(countChangedCharacters(recipient, lookalikeRecipient)).toBe(3);
    expect(() => deriveLookalikeAddress(recipient, [])).toThrow();
  });
});

describe("Demo Lab scenarios use the real verifier (FR-010)", () => {
  const expectations = {
    "exact-match": { status: "matched", reasons: [] },
    "changed-amount": { status: "blocked", reasons: ["AMOUNT_MISMATCH"] },
    "changed-recipient": { status: "blocked", reasons: ["RECIPIENT_MISMATCH"] },
    "extra-instruction": { status: "blocked", reasons: ["UNEXPECTED_ADDITIONAL_INSTRUCTION"] },
    "mutated-after-review": { status: "blocked", reasons: ["MESSAGE_CHANGED", "AMOUNT_MISMATCH"] },
  } as const;

  for (const scenario of LAB_SCENARIOS) {
    it(`${scenario.id} → ${expectations[scenario.id].status}`, () => {
      const run = runLabScenario(scenario.id, 1);
      expect(run.result.status).toBe(expectations[scenario.id].status);
      for (const reason of expectations[scenario.id].reasons) expect(run.result.reasons).toContain(reason);
    });
  }

  it("has exactly three core scenarios", () => {
    expect(LAB_SCENARIOS.filter((s) => s.core).map((s) => s.id)).toEqual(["exact-match", "changed-amount", "changed-recipient"]);
  });
});
