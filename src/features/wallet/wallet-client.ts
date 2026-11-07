import { createClient } from "@solana/kit";
import { walletWithoutSigner } from "@solana/kit-plugin-wallet";
import { SUPPORTED_CHAIN } from "@/config/product";

function createWalletClient() {
  return createClient().use(
    // `walletWithoutSigner`: the client exposes wallet state only. It never
    // installs a payer, so no helper can auto-build or auto-send transactions;
    // signing happens explicitly at IntentShield's verified sign boundary.
    walletWithoutSigner({
      chain: SUPPORTED_CHAIN,
      // Session-scoped reconnect only; nothing about the wallet persists long-term.
      storage: typeof window === "undefined" ? null : window.sessionStorage,
      storageKey: "intentshield:wallet",
      filter: (wallet) => wallet.chains.includes(SUPPORTED_CHAIN),
    }),
  );
}

export type WalletClient = ReturnType<typeof createWalletClient>;

let browserClient: WalletClient | null = null;

/**
 * Lazily-created browser singleton (StrictMode-safe: never disposed while the
 * page lives). On the server the plugin is inert (`status: 'pending'`).
 */
export function getWalletClient(): WalletClient {
  if (typeof window === "undefined") return createWalletClient();
  browserClient ??= createWalletClient();
  return browserClient;
}
