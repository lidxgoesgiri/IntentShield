# Security Policy

IntentShield checks that a native SOL transfer on **Solana Devnet** matches what the user approved before their wallet signs it. This document describes the security model, how it is enforced in code, its known limits, and how to report a vulnerability.

IntentShield has not had an independent security audit. It never claims that a recipient is trustworthy.

## Contents

- [Supported scope](#supported-scope)
- [Security invariants](#security-invariants)
- [Trust boundaries](#trust-boundaries)
- [Checks that gate signing and broadcast](#checks-that-gate-signing-and-broadcast)
- [AI boundaries](#ai-boundaries)
- [Threat model](#threat-model)
- [Known technical limits](#known-technical-limits)
- [Handling secrets](#handling-secrets)
- [Reporting a vulnerability](#reporting-a-vulnerability)

## Supported scope

| In scope | Out of scope |
|---|---|
| Native SOL transfers on Solana Devnet, up to 1 SOL | Mainnet (disabled), SPL tokens, NFTs, swaps, arbitrary programs |
| One System Program transfer, optionally with the app's fixed compute budget | Recipient reputation, scam or phishing-site detection |
| Wallets that support Wallet Standard `solana:signTransaction` | Compromised wallets, browsers, or malicious extensions |

## Security invariants

These are enforced in code and covered by automated tests (`npm test`, `npm run test:e2e`):

1. **Non-custodial.** The app never asks for, stores, logs, or transmits seed phrases or private keys. Only the user's wallet signs.
2. **Deterministic verification decides; AI never does.** The verifier ([`src/features/verification/lib`](src/features/verification/lib)) is a pure function over the exact message bytes, with no AI, wallet, RPC, or UI dependency.
3. **Fail closed.** Anything that cannot be decoded or verified keeps signing disabled. This covers a mismatched recipient, amount, source, or fee payer; extra or unsupported instructions; non-Devnet networks; failed or unavailable simulation; and an expired blockhash.
4. **Verified signing boundary.** The app broadcasts only if the wallet returned the same message bytes it reviewed, signed by the approved account with a valid Ed25519 signature. It never re-signs automatically.
5. **Honest status.** "Submitted" is never shown as "Confirmed"; confirmation requires RPC evidence of `confirmed` or `finalized` with no transaction error.
6. **Secrets stay server-side.** AI provider keys live only in server environment variables, read by modules marked `server-only`.

## Trust boundaries

| Boundary | Responsibility and limits |
|---|---|
| **User → approved intent** | The user reviews the recipient and amount. A transaction that matches a mistaken approval is still the wrong transfer. |
| **AI provider → draft** | Model output is untrusted. Schema validation and literal guards constrain it; only the user's explicit approval establishes intent. |
| **Message → verifier** | Deterministic code checks the decoded bytes, never the draft or a UI summary. |
| **App → Devnet RPC** | Genesis hash, balance, fees, simulation, and confirmation come from the configured RPC. This is a trust dependency on the RPC, not independent consensus verification. |
| **App → wallet** | The wallet signs without sending. The app then checks the exact returned bytes and the approved account's signature. |

## Checks that gate signing and broadcast

- **Network:** configuration accepts only `devnet`, and the RPC must report the Devnet genesis hash (`EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG`).
- **Instruction allowlist:** exactly one System Program transfer. The builder prepends a fixed compute budget of 1,000 compute units at 1 micro-lamport per unit, so wallets do not insert their own priority-fee instructions. The verifier accepts either that exact layout or a lone transfer; any other compute-budget value, order, or extra instruction is blocked.
- **Exact intent comparison:** the full recipient, source, fee payer, account roles, and `BigInt` lamports must match. Legacy and v0 messages are supported; address lookup tables, extra signers, and unexpected accounts fail closed.
- **Byte integrity:** verification and simulation bind to the same message fingerprint. The message is re-verified at the signing boundary, and the returned message bytes must equal the reviewed bytes. When a wallet changes them, for example by adding Lighthouse assertions, the app refuses to send and names the change.
- **Signature:** the approved sender must be the sole signer, and its Ed25519 signature (verified with WebCrypto) must be valid before the signed transaction is broadcast.
- **State integrity:** stale approvals, duplicate clicks, account changes, expiry, cancellation, and late wallet responses cannot authorize a new broadcast.

**Simulation and broadcast details.** Simulation runs on the unsigned message with `sigVerify: false` and `replaceRecentBlockhash: false`, so it exercises the exact reviewed bytes but does not validate a signature; signature validation happens after the wallet signs. The app makes a single `sendTransaction` call with preflight enabled, and the RPC may rebroadcast those same signed bytes under its retry policy (`maxRetries: 5`).

## AI boundaries

- AI is optional. Without a configured key and model, the AI routes answer `503 AI_UNAVAILABLE`, and manual entry runs every check.
- Selectable models come from a server-side allowlist of up to 12 model IDs. Any other model ID is rejected with `400` before a provider call. The model choice never reaches the verifier, simulation, or signing gate; an import-graph test enforces this.
- A drafted recipient must appear verbatim in the user's text, and an amount must be written literally. Otherwise the field is discarded.
- Inputs and outputs are bounded:
  - intent text is limited to 300 characters;
  - each provider call times out after 8 seconds, within an 18-second total budget, with at most one fallback attempt;
  - a failed model cools down for 60 seconds;
  - provider responses are capped at 64 KiB and API responses read by the browser at 16 KiB.
- **Data sent to the provider:**
  - Intent parsing sends the user's text, including any address written in it.
  - The explanation endpoint sends only the verdict, the reason codes, the amounts, a recipient-match flag, and the simulation outcome. It never sends addresses.

## Threat model

| Threat | Response |
|---|---|
| AI invents a recipient or amount | Ungrounded fields are discarded; the user must review and approve explicitly |
| Recipient, amount, or instructions changed in the built transaction | Decoded values are compared with the approval; the instruction allowlist is enforced |
| Bytes changed after review or inside the wallet | Fingerprint and byte equality are re-checked; broadcast is refused |
| Wallet returns a forged or wrong signature | The Ed25519 signature is verified against the approved account |
| Wrong network, failed simulation, unreadable RPC response | Signing stays disabled; nothing is inferred as success |
| Duplicate clicks or stale asynchronous work | Signing lock, approval identity, and cancellation guards |
| Broadcast response lost | The known signature is tracked and the status stays unresolved instead of being reported as success |

## Known technical limits

- **RPC trust.** Network identity, simulation, and confirmation rely on the configured RPC endpoint. A successful simulation describes one point in time and cannot guarantee inclusion or later execution.
- **Ambiguous broadcasts.** An interrupted broadcast response is reported as unknown, not as proof that nothing was sent. Check the known signature before retrying a transfer.
- **Receipt recovery storage.** To recover a receipt after a reload, the public transaction signature is kept in session storage, scoped to Devnet and the originating wallet. Private keys, signed transactions, and approvals are never stored. Receipt URLs are public lookups of the signature they contain.
- **AI cost controls.** Rate and daily-budget counters are kept per server process. Separate serverless instances and restarts do not share them, so they are not a global spending cap. Set a spending limit with the AI provider as well.
- **Content Security Policy.** The CSP allows `'unsafe-inline'` scripts for Next.js hydration. `script-src-attr 'none'`, `frame-src 'none'`, and other directives reduce, but do not eliminate, cross-site scripting risk.
- **Browser support.** Ed25519 signature checks require WebCrypto support; browsers without it fail closed.

## Handling secrets

- Copy `.env.example` to `.env.local` for local development; `.env*` files other than `.env.example` are git-ignored.
- Never prefix a secret with `NEXT_PUBLIC_`, and set production secrets in the hosting provider's environment settings.
- If a key is ever exposed, revoke and rotate it at the provider immediately. Removing it from a later commit is not enough.

## Reporting a vulnerability

Please report suspected vulnerabilities privately through GitHub's **Security → Report a vulnerability** flow on this repository, or contact the maintainer through their GitHub profile. Do not open a public issue with exploit details. Include steps to reproduce, the affected route or module, and the impact you observed.
