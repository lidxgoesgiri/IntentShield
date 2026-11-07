# Security Policy

IntentShield is a hackathon MVP that runs on **Solana Devnet only**. It helps people check that a native SOL transfer matches what they approved before their wallet signs it. It is not a substitute for a professional security audit, and it never claims a recipient is trustworthy.

## Security invariants

These are enforced in code and covered by automated tests (`npm test`, `npm run test:e2e`):

1. **Non-custodial.** The app never asks for, stores, logs, or transmits seed phrases or private keys. Only the user's wallet signs (Wallet Standard `solana:signTransaction`).
2. **Deterministic verification decides; AI never does.** The verifier (`src/features/verification/lib`) is a pure function over the exact message bytes. AI output is untrusted, schema-validated, and guarded (a recipient must appear verbatim in the user's text).
3. **Fail closed.** Mismatched recipient/amount/source/fee payer, extra or unsupported instructions, undecodable messages, non-Devnet networks, failed or unavailable simulation, and expired blockhashes all keep signing disabled.
4. **Verified signing boundary.** The app refuses to broadcast unless the wallet returned the same message bytes it reviewed, signed by the approved account with a valid Ed25519 signature. It broadcasts those bytes once and never re-signs automatically.
5. **Honest status.** "Submitted" is never shown as "Confirmed"; confirmation requires RPC evidence.
6. **Secrets stay server-side.** AI provider keys live only in server environment variables (never `NEXT_PUBLIC_*`), in modules marked `server-only`. The AI model is configured on the server, not by the browser.

## Out of scope

Recipient reputation or scam detection, mainnet funds, SPL tokens or other programs, phishing-site detection, compromised wallets, and malicious browser extensions.

## Handling secrets

- Copy `.env.example` to `.env.local` for local development; `.env*` files (except `.env.example`) are git-ignored.
- Set production secrets in the hosting provider's environment settings.
- If a key is ever exposed, revoke and rotate it at the provider immediately; removing it from a later commit is not enough.

## Reporting a vulnerability

Please report suspected vulnerabilities privately through GitHub's **Security → Report a vulnerability** flow on this repository (or by contacting the maintainer via their GitHub profile). Do not open a public issue with exploit details. Include steps to reproduce, the affected route or module, and the impact you observed.
