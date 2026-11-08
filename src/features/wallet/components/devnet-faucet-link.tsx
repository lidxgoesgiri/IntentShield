import { DEVNET_FAUCET_URL } from "@/config/product";
import { cn } from "@/lib/utils";

/**
 * Link to the official Solana faucet for free Devnet SOL, so a first-time
 * tester can fund a wallet without leaving the flow guessing. Devnet SOL has
 * no value; the app never requests an airdrop itself.
 */
export function DevnetFaucetLink({ className }: { className?: string }) {
  return (
    <a
      href={DEVNET_FAUCET_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex min-h-11 items-center text-white underline decoration-mint/60 underline-offset-4 hover:decoration-mint",
        className,
      )}
    >
      Get free Devnet SOL from the Solana Faucet<span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}
