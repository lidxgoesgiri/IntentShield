/** Historical user-supplied transfer, independently re-read at finalized commitment during remediation.
 * This is public evidence, not a claim that the current session opened or signed with Phantom.
 */
export const HISTORICAL_DEVNET_PROOF = {
  signature: "3f6Kzf4dy9d3q7UXTZTQzN3HUGV1jKLxH83dgXhj7FTaZFXDQd2Vzbox1dXuQKi6tmFhWtfwJfEUTqsWU6atsTzT",
  amountSol: "0.01",
  actualFeeLamports: "5001",
  slot: "519712179",
} as const;
