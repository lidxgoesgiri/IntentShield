import { DEVNET_GENESIS_HASH } from "@/config/product";
import { RpcRequestError, type SignatureStatusInfo, type SimulationRpcValue, type SolanaRpcPort } from "@/lib/solana/rpc";
import { TEST_BLOCKHASH } from "@/test/fixtures/solana";

export type FakeRpcOptions = Partial<{
  genesisHash: string | Error;
  blockhash: { blockhash: string; lastValidBlockHeight: bigint } | Error;
  blockHeight: bigint | Error;
  balance: bigint | Error;
  fee: bigint | null | Error;
  simulation: SimulationRpcValue | Error;
  sendResult: string | Error | ((wire: string) => string);
  statuses: Array<SignatureStatusInfo | null>;
}>;

/** Scriptable in-memory RPC port with call recording. */
export function createFakeRpc(options: FakeRpcOptions = {}) {
  const calls: Record<string, number> = {};
  const sent: string[] = [];
  let statusIndex = 0;
  const track = (name: string) => {
    calls[name] = (calls[name] ?? 0) + 1;
  };
  const resolve = <T>(value: T | Error): Promise<T> =>
    value instanceof Error ? Promise.reject(value) : Promise.resolve(value);

  const port: SolanaRpcPort = {
    getGenesisHash: () => {
      track("getGenesisHash");
      return resolve(options.genesisHash ?? DEVNET_GENESIS_HASH);
    },
    getLatestBlockhash: () => {
      track("getLatestBlockhash");
      return resolve(options.blockhash ?? { blockhash: TEST_BLOCKHASH as string, lastValidBlockHeight: 1_000n });
    },
    getBlockHeight: () => {
      track("getBlockHeight");
      return resolve(options.blockHeight ?? 900n);
    },
    getBalance: () => {
      track("getBalance");
      return resolve(options.balance ?? 2_000_000_000n);
    },
    getFeeForMessage: () => {
      track("getFeeForMessage");
      return resolve(options.fee === undefined ? 5_000n : options.fee);
    },
    simulateTransaction: () => {
      track("simulateTransaction");
      return resolve(options.simulation ?? { err: null, logs: ["Program 11111111111111111111111111111111 success"], unitsConsumed: 150n });
    },
    sendTransaction: (wire: string) => {
      track("sendTransaction");
      sent.push(wire);
      const result = options.sendResult;
      if (typeof result === "function") return Promise.resolve(result(wire));
      return resolve(result ?? new RpcRequestError("rpc", "sendResult not scripted"));
    },
    getSignatureStatus: () => {
      track("getSignatureStatus");
      const list = options.statuses ?? [];
      const value = list[Math.min(statusIndex, list.length - 1)] ?? null;
      statusIndex += 1;
      return Promise.resolve(value);
    },
    getTransaction: () => {
      track("getTransaction");
      return Promise.resolve(null);
    },
  };
  return { port, calls, sent };
}
