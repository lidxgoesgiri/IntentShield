import { describe, expect, it } from "vitest";
import { amountErrorMessage, parseSolAmount } from "@/features/intent/lib/amount-to-lamports";
import { formatLamportsAsSol, formatLamportsGrouped } from "@/lib/format/sol";

describe("parseSolAmount — decimal string to BigInt lamports (PRD FR-003)", () => {
  it("UT-01: converts 0.1 SOL to 100000000n", () => {
    expect(parseSolAmount("0.1")).toEqual({ ok: true, lamports: 100_000_000n, normalized: "0.1" });
  });

  it("UT-02: converts 0.000000001 SOL to 1n", () => {
    expect(parseSolAmount("0.000000001")).toEqual({ ok: true, lamports: 1n, normalized: "0.000000001" });
  });

  it("UT-03: rejects 10 decimal places", () => {
    expect(parseSolAmount("0.0000000001")).toEqual({ ok: false, error: "TOO_MANY_DECIMALS" });
  });

  it.each([
    ["-1", "NEGATIVE"],
    ["-0.1", "NEGATIVE"],
    ["0", "ZERO"],
    ["0.000000000", "ZERO"],
    ["NaN", "INVALID_FORMAT"],
    ["Infinity", "INVALID_FORMAT"],
    ["1e-9", "INVALID_FORMAT"],
    ["1E2", "INVALID_FORMAT"],
    ["0x10", "INVALID_FORMAT"],
    ["+1", "INVALID_FORMAT"],
    [".5", "INVALID_FORMAT"],
    ["5.", "INVALID_FORMAT"],
    ["1 000", "INVALID_FORMAT"],
    ["0,1", "COMMA_DECIMAL"],
    ["", "EMPTY"],
    ["   ", "EMPTY"],
    ["1.5", "EXCEEDS_LIMIT"],
    ["1.000000001", "EXCEEDS_LIMIT"],
    ["9".repeat(40), "TOO_LONG"],
  ])("UT-04: rejects %j with %s", (input, error) => {
    expect(parseSolAmount(input)).toEqual({ ok: false, error });
  });

  it("rejects non-string input without coercion", () => {
    expect(parseSolAmount(0.1)).toEqual({ ok: false, error: "INVALID_FORMAT" });
    expect(parseSolAmount(Number.NaN)).toEqual({ ok: false, error: "INVALID_FORMAT" });
    expect(parseSolAmount(null)).toEqual({ ok: false, error: "INVALID_FORMAT" });
  });

  it("accepts the exact 1 SOL demo limit and trims surrounding whitespace", () => {
    expect(parseSolAmount(" 1 ")).toEqual({ ok: true, lamports: 1_000_000_000n, normalized: "1" });
    expect(parseSolAmount("1.000000000")).toEqual({ ok: true, lamports: 1_000_000_000n, normalized: "1" });
  });

  it("normalizes leading/trailing zeros without floating point drift", () => {
    expect(parseSolAmount("00.300000000")).toEqual({ ok: true, lamports: 300_000_000n, normalized: "0.3" });
    // 0.1 + 0.2 style float errors are impossible: digits map to lamports exactly.
    expect(parseSolAmount("0.3")).toMatchObject({ lamports: 300_000_000n });
  });

  it("respects a custom maximum", () => {
    expect(parseSolAmount("2", { maxLamports: 5_000_000_000n })).toMatchObject({ ok: true, lamports: 2_000_000_000n });
  });

  it("returns human-readable error copy for every code", () => {
    expect(amountErrorMessage("EXCEEDS_LIMIT", "1")).toContain("1 SOL");
    expect(amountErrorMessage("TOO_MANY_DECIMALS")).toContain("9 decimal places");
  });
});

describe("formatLamportsAsSol", () => {
  it.each([
    [1n, "0.000000001"],
    [100_000_000n, "0.1"],
    [1_000_000_000n, "1"],
    [1_234_567_890n, "1.23456789"],
    [0n, "0"],
  ])("formats %s lamports as %s", (lamports, text) => {
    expect(formatLamportsAsSol(lamports)).toBe(text);
  });

  it("groups digits for display", () => {
    expect(formatLamportsGrouped(100_000_000n)).toBe("100,000,000");
  });
});
