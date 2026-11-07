import { describe, expect, it } from "vitest";
import { describeMessageChange } from "@/features/verification/lib/describe-message-change";
import {
  compileMessage,
  computeUnitLimitIx,
  computeUnitPriceIx,
  lighthouseIx,
  RECIPIENT,
  SENDER,
  transferIx,
} from "@/test/fixtures/solana";

const transfer = () => transferIx(SENDER, RECIPIENT, 10_000_000n);
const reviewed = compileMessage([computeUnitLimitIx(1_000), computeUnitPriceIx(1n), transfer()]);

describe("describeMessageChange (MESSAGE_CHANGED explanation, display only)", () => {
  it("names priority-fee instructions a wallet inserted", () => {
    const returned = compileMessage([computeUnitLimitIx(200_000), computeUnitPriceIx(50_000n), transfer()]);
    // Same programs, different contents.
    expect(describeMessageChange(reviewed, returned)).toBe("it changed the instruction contents");
    const plain = compileMessage([transfer()]);
    expect(describeMessageChange(plain, reviewed)).toBe("it added Compute Budget (priority fee) instructions");
  });

  it("names Lighthouse safety assertions", () => {
    const returned = compileMessage([computeUnitLimitIx(1_000), computeUnitPriceIx(1n), transfer(), lighthouseIx()]);
    expect(describeMessageChange(reviewed, returned)).toBe("it added Lighthouse safety assertions");
  });

  it("reports removed instructions and undecodable output", () => {
    expect(describeMessageChange(reviewed, compileMessage([transfer()]))).toBe("it removed Compute Budget (priority fee) instructions");
    expect(describeMessageChange(reviewed, Uint8Array.from([1, 2, 3]))).toBe("it returned a transaction IntentShield cannot decode");
  });
});
