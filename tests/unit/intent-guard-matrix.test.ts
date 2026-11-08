import { describe, expect, it } from "vitest";
import { enforceIntentGuards } from "@/features/intent/lib/normalize-intent";
import { ParseIntentResponseSchema } from "@/features/intent/schema";
import { INTENT_GUARD_MATRIX } from "@/test/fixtures/intent-guard-matrix";

describe("offline golden matrix — deterministic guards, not live AI accuracy", () => {
  it.each(INTENT_GUARD_MATRIX)("$label", ({ text, candidate, expected }) => {
    const actual = enforceIntentGuards(candidate, text);
    expect(actual).toMatchObject(expected);
    expect(ParseIntentResponseSchema.safeParse(actual).success).toBe(true);
  });
});
