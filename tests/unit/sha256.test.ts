import { createHash, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { bytesEqual, fingerprintMessage, shortFingerprint } from "@/features/verification/lib/fingerprint-message";
import { sha256Hex } from "@/features/verification/lib/sha256";

const utf8 = (text: string) => new TextEncoder().encode(text);

describe("sha256 (pure, synchronous)", () => {
  it("matches FIPS 180-4 known vectors", () => {
    expect(sha256Hex(utf8(""))).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Hex(utf8("abc"))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256Hex(utf8("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"))).toBe(
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
    );
  });

  it("matches node:crypto for random inputs across block boundaries", () => {
    for (const length of [1, 55, 56, 63, 64, 65, 119, 120, 127, 128, 200, 1232]) {
      const data = randomBytes(length);
      expect(sha256Hex(data)).toBe(createHash("sha256").update(data).digest("hex"));
    }
  });
});

describe("fingerprintMessage", () => {
  it("is stable and prefixed", () => {
    const bytes = utf8("message");
    expect(fingerprintMessage(bytes)).toBe(fingerprintMessage(Uint8Array.from(bytes)));
    expect(fingerprintMessage(bytes)).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(shortFingerprint(fingerprintMessage(bytes))).toMatch(/^[0-9a-f]{8}…[0-9a-f]{8}$/);
  });

  it("changes when a single bit changes", () => {
    const a = utf8("message");
    const b = Uint8Array.from(a);
    b[0] = (b[0] ?? 0) ^ 1;
    expect(fingerprintMessage(a)).not.toBe(fingerprintMessage(b));
    expect(bytesEqual(a, b)).toBe(false);
    expect(bytesEqual(a, Uint8Array.from(a))).toBe(true);
  });
});
