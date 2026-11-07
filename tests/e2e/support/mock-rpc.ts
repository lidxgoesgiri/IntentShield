import type { Page, Route } from "@playwright/test";
import { getBase58Decoder } from "@solana/kit";

export const DEVNET_GENESIS = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
export const MAINNET_GENESIS = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
const BLOCKHASH = "4sGjMW1sUnHzSxGspuhpqLDx6wiyjNtZAMdL4VZHirAn";

export type MockRpcOptions = Partial<{
  genesisHash: string;
  balance: number;
  simulationErr: unknown;
  simulationUnavailable: boolean;
  sendError: { code: number; message: string; data?: unknown } | null;
  /** Signature statuses returned in order (last one repeats). */
  statuses: Array<"processed" | "confirmed" | null>;
}>;

export type MockRpcLog = { methods: string[]; sentTransactions: string[] };

function signatureOfWire(base64: string): string {
  const wire = Buffer.from(base64, "base64");
  // Single-signer legacy/v0 wire: [compact-u16 = 1][64-byte signature][message]
  return getBase58Decoder().decode(Uint8Array.from(wire.subarray(1, 65)));
}

/**
 * Deterministic in-test stand-in for the Solana Devnet JSON-RPC endpoint.
 * Only used by E2E tests; the app itself always talks to the configured RPC.
 */
export async function mockDevnetRpc(page: Page, options: MockRpcOptions = {}): Promise<MockRpcLog> {
  const log: MockRpcLog = { methods: [], sentTransactions: [] };
  let statusIndex = 0;
  let lastSignature: string | null = null;

  await page.route("https://api.devnet.solana.com/**", async (route: Route) => {
    if (route.request().method() !== "POST") return route.fulfill({ status: 405 });
    const body = route.request().postDataJSON() as { id: number | string; method: string; params?: unknown[] };
    log.methods.push(body.method);
    const ctx = { context: { slot: 1000, apiVersion: "4.4.0" } };
    const reply = (result: unknown) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ jsonrpc: "2.0", id: body.id, result }) });
    const fail = (error: { code: number; message: string; data?: unknown }) =>
      route.fulfill({ contentType: "application/json", body: JSON.stringify({ jsonrpc: "2.0", id: body.id, error }) });

    switch (body.method) {
      case "getGenesisHash":
        return reply(options.genesisHash ?? DEVNET_GENESIS);
      case "getLatestBlockhash":
        return reply({ ...ctx, value: { blockhash: BLOCKHASH, lastValidBlockHeight: 5000 } });
      case "getBlockHeight":
        return reply(4000);
      case "getBalance":
        return reply({ ...ctx, value: options.balance ?? 2_000_000_000 });
      case "getFeeForMessage":
        return reply({ ...ctx, value: 5000 });
      case "simulateTransaction":
        if (options.simulationUnavailable) return route.abort("connectionrefused");
        return reply({
          ...ctx,
          value: {
            err: options.simulationErr ?? null,
            logs: ["Program 11111111111111111111111111111111 invoke [1]", "Program 11111111111111111111111111111111 success"],
            unitsConsumed: 150,
            accounts: null,
            returnData: null,
            innerInstructions: null,
            replacementBlockhash: null,
            fee: 5000,
            loadedAccountsDataSize: 0,
            preBalances: null,
            postBalances: null,
            preTokenBalances: null,
            postTokenBalances: null,
            loadedAddresses: null,
          },
        });
      case "sendTransaction": {
        const wire = String((body.params ?? [])[0]);
        log.sentTransactions.push(wire);
        if (options.sendError) return fail(options.sendError);
        lastSignature = signatureOfWire(wire);
        return reply(lastSignature);
      }
      case "getSignatureStatuses": {
        const list = options.statuses ?? ["processed", "confirmed"];
        const status = list[Math.min(statusIndex, list.length - 1)] ?? null;
        statusIndex += 1;
        return reply({
          ...ctx,
          value: [status === null ? null : { slot: 1001, confirmations: status === "confirmed" ? 1 : 0, err: null, status: { Ok: null }, confirmationStatus: status }],
        });
      }
      case "getTransaction":
        return reply(null);
      default:
        return fail({ code: -32601, message: `Method not mocked: ${body.method}` });
    }
  });

  return log;
}
