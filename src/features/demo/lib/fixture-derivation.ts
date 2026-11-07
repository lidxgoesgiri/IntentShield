import { getAddressDecoder, isAddress } from "@solana/kit";
import { sha256 } from "@/features/verification/lib/sha256";

/**
 * Transparent derivation of synthetic demo fixtures. Every value is
 * base58(SHA-256(label)) — a syntactically valid Solana address for which no
 * private key is known. Nothing here is a real user wallet or a real blockhash.
 */
export function deriveDemoAddress(label: string): string {
  return getAddressDecoder().decode(sha256(new TextEncoder().encode(`intentshield:demo:${label}`)));
}

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/**
 * Build a "lookalike" of `address`: same prefix and suffix, a few characters
 * changed in the middle, still a valid 32-byte address. This mirrors how
 * address-poisoning attacks fool people who only compare the ends.
 */
export function deriveLookalikeAddress(address: string, positions: readonly number[] = [18, 21, 24]): string {
  const chars = [...address];
  for (const position of positions) {
    const original = chars[position];
    if (original === undefined) continue;
    const start = BASE58_ALPHABET.indexOf(original);
    for (let step = 7; step < BASE58_ALPHABET.length + 7; step += 1) {
      const candidate: string = BASE58_ALPHABET.charAt((start + step) % BASE58_ALPHABET.length);
      if (candidate === original) continue;
      const trial = [...chars];
      trial[position] = candidate;
      if (isAddress(trial.join(""))) {
        chars[position] = candidate;
        break;
      }
    }
  }
  const result = chars.join("");
  if (result === address || !isAddress(result)) throw new Error("Could not derive a lookalike address.");
  return result;
}

export type DemoParties = Readonly<{
  sender: string;
  recipient: string;
  lookalikeRecipient: string;
  attacker: string;
  blockhash: string;
}>;

export function deriveDemoParties(): DemoParties {
  const recipient = deriveDemoAddress("recipient");
  return {
    sender: deriveDemoAddress("sender"),
    recipient,
    lookalikeRecipient: deriveLookalikeAddress(recipient),
    attacker: deriveDemoAddress("attacker"),
    blockhash: deriveDemoAddress("blockhash"),
  };
}
