"use client";

import { useConnect, useDisconnect, useWallets } from "@solana/kit-plugin-wallet/react";
import { Unplug, Wallet as WalletIcon } from "lucide-react";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { Dialog } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/misc";
import { formatLamportsAsSol } from "@/lib/format/sol";
import { shortenAddress } from "@/lib/format/address";
import { useBalance } from "../hooks/use-balance";
import { useConnectedWallet } from "../hooks/use-connected-wallet";
import { useProductContext } from "../product-context";

function WalletGlyph({ icon, name }: { icon: string | null; name: string }) {
  // Wallet Standard icons are data: URIs (verified by the plugin); render as an image.
  if (icon && icon.startsWith("data:image/")) {
    // eslint-disable-next-line @next/next/no-img-element -- data URI from the wallet, not a network asset
    return <img src={icon} alt="" width={24} height={24} className="size-6 rounded-md" />;
  }
  return (
    <span aria-hidden className="inline-flex size-6 items-center justify-center rounded-md bg-raised font-mono text-xs text-silver">
      {name.slice(0, 1)}
    </span>
  );
}

/**
 * WalletConnectButton states: disconnected, connecting, connected,
 * wrong-network (no Devnet / no signTransaction), error (PRD §12).
 */
export function WalletConnectButton() {
  const { walletClient } = useProductContext();
  const wallet = useConnectedWallet();
  const wallets = useWallets(walletClient);
  const connect = useConnect(walletClient);
  const disconnect = useDisconnect(walletClient);
  const { balance } = useBalance(wallet.address);
  const [open, setOpen] = useState(false);

  const connectError =
    connect.error && !(connect.error instanceof DOMException && connect.error.name === "AbortError")
      ? "The wallet did not connect. You may have cancelled the request."
      : null;

  if (!wallet.ready) {
    return (
      <Button variant="secondary" size="sm" disabled aria-busy="true">
        <Spinner label="Checking wallet" />
      </Button>
    );
  }

  if (!wallet.address) {
    return (
      <>
        <Button variant="secondary" size="sm" onClick={() => setOpen(true)} disabled={connect.isRunning}>
          {connect.isRunning ? <Spinner label="Connecting…" /> : (
            <>
              <WalletIcon className="size-4" aria-hidden /> Connect wallet
            </>
          )}
        </Button>
        <Dialog
          open={open}
          onOpenChange={setOpen}
          title="Connect a Devnet wallet"
          description="IntentShield never asks for a seed phrase or private key. Your wallet signs — the app only prepares and checks."
        >
          {wallets.length === 0 ? (
            <Alert tone="info" title="No Solana wallet detected">
              On desktop, use a compatible Solana wallet extension such as Phantom, Solflare or Backpack and enable Devnet.
              On mobile, open this site inside a compatible wallet browser. If your wallet does not appear here, use a desktop extension.
            </Alert>
          ) : (
            <ul className="space-y-2" aria-label="Available wallets">
              {wallets.map((w) => (
                <li key={w.name}>
                  <button
                    type="button"
                    className="flex min-h-13 w-full items-center gap-3 rounded-[var(--radius-control)] border border-hairline bg-obsidian/60 px-4 text-left text-white transition-colors hover:border-mint/50 hover:bg-raised disabled:opacity-60"
                    disabled={connect.isRunning}
                    onClick={() => {
                      void connect
                        .dispatchAsync(w)
                        .then(() => setOpen(false))
                        .catch(() => undefined);
                    }}
                  >
                    <WalletGlyph icon={w.icon ?? null} name={w.name} />
                    <span className="flex-1 font-medium">{w.name}</span>
                    <span className="type-caption">Devnet</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {connectError ? (
            <p role="status" className="mt-4 text-[0.9rem] text-danger">
              {connectError}
            </p>
          ) : null}
          <p className="type-caption mt-5">
            Your wallet must support signing without sending. Enable Devnet / testnet mode so its preview matches this app.
          </p>
        </Dialog>
      </>
    );
  }

  const warning = !wallet.supportsDevnet
    ? "This wallet account does not support Solana Devnet. Signing is disabled."
    : !wallet.signer
      ? "This wallet cannot sign without broadcasting (no solana:signTransaction), so IntentShield cannot verify what it signs. Signing is disabled."
      : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-11 items-center gap-2.5 rounded-full border border-hairline bg-carbon py-1 pl-1.5 pr-3.5 text-sm text-white transition-colors hover:border-silver/40"
        aria-label={`Wallet ${wallet.walletName ?? ""} connected: ${wallet.address}. Open wallet details.`}
      >
        <WalletGlyph icon={wallet.walletIcon} name={wallet.walletName ?? "W"} />
        <span className="font-data">{shortenAddress(wallet.address)}</span>
        {warning ? <span aria-hidden className="size-2 rounded-full bg-warning" /> : null}
      </button>
      <Dialog open={open} onOpenChange={setOpen} title={wallet.walletName ?? "Wallet"} description="Connected account on Solana Devnet.">
        <dl className="space-y-4">
          <div>
            <dt className="type-caption">Address (full)</dt>
            <dd className="mt-1 flex items-center gap-1">
              <span className="font-data text-[0.9rem] text-white">{wallet.address}</span>
              <CopyButton value={wallet.address} label="wallet address" />
            </dd>
          </div>
          <div>
            <dt className="type-caption">Devnet balance (from RPC)</dt>
            <dd className="mt-1 font-data text-white">
              {balance.status === "ok"
                ? `${formatLamportsAsSol(balance.lamports)} SOL`
                : balance.status === "unavailable"
                  ? "Unavailable — RPC did not respond"
                  : "Loading…"}
            </dd>
          </div>
        </dl>
        {warning ? (
          <Alert tone="warning" title="Wallet limitation" className="mt-5">
            {warning}
          </Alert>
        ) : null}
        <div className="mt-6 flex flex-wrap gap-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              void disconnect.dispatchAsync().finally(() => setOpen(false));
            }}
            disabled={disconnect.isRunning}
          >
            <Unplug className="size-4" aria-hidden /> Disconnect
          </Button>
        </div>
      </Dialog>
    </>
  );
}
