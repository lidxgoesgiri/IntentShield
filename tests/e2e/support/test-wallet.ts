import type { Page } from "@playwright/test";

export type TestWalletMode = "approve" | "reject" | "mutate";

/**
 * Registers a TEST-ONLY Wallet Standard wallet inside the page (never part of
 * the app bundle). It holds an in-page Ed25519 key generated with WebCrypto
 * and implements standard:connect/disconnect/events + solana:signTransaction.
 * Modes: approve (sign exactly), reject (user rejection), mutate (alter the
 * message before signing — the app must refuse to broadcast).
 */
export async function installTestWallet(page: Page, mode: TestWalletMode = "approve") {
  await page.addInitScript((walletMode: string) => {
    const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    const base58 = (bytes: Uint8Array) => {
      const digits = [0];
      for (const byte of bytes) {
        let carry = byte;
        for (let i = 0; i < digits.length; i += 1) {
          carry += digits[i]! << 8;
          digits[i] = carry % 58;
          carry = (carry / 58) | 0;
        }
        while (carry > 0) {
          digits.push(carry % 58);
          carry = (carry / 58) | 0;
        }
      }
      let out = "";
      for (const byte of bytes) {
        if (byte !== 0) break;
        out += "1";
      }
      for (let i = digits.length - 1; i >= 0; i -= 1) out += ALPHABET[digits[i]!];
      return out;
    };

    const state: {
      keyPair: CryptoKeyPair | null;
      account: { address: string; publicKey: Uint8Array; chains: string[]; features: string[]; label: string } | null;
      listeners: Array<(props: unknown) => void>;
      signCalls: number;
    } = { keyPair: null, account: null, listeners: [], signCalls: 0 };
    (window as unknown as { __testWallet: typeof state }).__testWallet = state;

    const ready = (async () => {
      const keyPair = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as CryptoKeyPair;
      const publicKey = new Uint8Array(await crypto.subtle.exportKey("raw", keyPair.publicKey));
      state.keyPair = keyPair;
      state.account = {
        address: base58(publicKey),
        publicKey,
        chains: ["solana:devnet"],
        features: ["solana:signTransaction"],
        label: "E2E test account",
      };
    })();

    const emit = () => state.listeners.forEach((listener) => listener({ accounts: wallet.accounts }));

    const readCompactU16 = (bytes: Uint8Array, offset: number): [number, number] => {
      let value = 0;
      let size = 0;
      for (;;) {
        const byte = bytes[offset + size]!;
        value |= (byte & 0x7f) << (7 * size);
        size += 1;
        if ((byte & 0x80) === 0) return [value, size];
      }
    };

    const wallet = {
      version: "1.0.0" as const,
      name: "IntentShield Test Wallet",
      icon: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHZpZXdCb3g9JzAgMCAxMCAxMCc+PHJlY3Qgd2lkdGg9JzEwJyBoZWlnaHQ9JzEwJyBmaWxsPScjNjRlOGM3Jy8+PC9zdmc+",
      chains: ["solana:devnet"],
      get accounts() {
        return state.account ? [state.account] : [];
      },
      features: {
        "standard:connect": {
          version: "1.0.0",
          connect: async () => {
            await ready;
            emit();
            return { accounts: wallet.accounts };
          },
        },
        "standard:disconnect": {
          version: "1.0.0",
          disconnect: async () => {
            emit();
          },
        },
        "standard:events": {
          version: "1.0.0",
          on: (_event: string, listener: (props: unknown) => void) => {
            state.listeners.push(listener);
            return () => {
              state.listeners = state.listeners.filter((l) => l !== listener);
            };
          },
        },
        "solana:signTransaction": {
          version: "1.0.0",
          supportedTransactionVersions: ["legacy", 0],
          signTransaction: async (...inputs: Array<{ transaction: Uint8Array }>) => {
            await ready;
            state.signCalls += 1;
            if (walletMode === "reject") {
              throw Object.assign(new Error("User rejected the request."), { code: 4001 });
            }
            return Promise.all(
              inputs.map(async ({ transaction }) => {
                const wire = Uint8Array.from(transaction);
                const [count, size] = readCompactU16(wire, 0);
                const messageStart = size + count * 64;
                if (walletMode === "mutate") {
                  // Alter the last lamports byte of the message (a malicious/buggy wallet).
                  wire[wire.length - 8] = (wire[wire.length - 8]! + 1) % 256;
                }
                const message = wire.slice(messageStart);
                const signature = new Uint8Array(await crypto.subtle.sign("Ed25519", state.keyPair!.privateKey, message));
                wire.set(signature, size);
                return { signedTransaction: wire };
              }),
            );
          },
        },
      },
    };

    const callback = ({ register }: { register: (w: unknown) => void }) => register(wallet);
    window.addEventListener("wallet-standard:app-ready", (event) => callback((event as CustomEvent).detail));
    window.dispatchEvent(new CustomEvent("wallet-standard:register-wallet", { detail: callback }));
  }, mode);
}

export async function testWalletSignCalls(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { __testWallet: { signCalls: number } }).__testWallet.signCalls);
}
