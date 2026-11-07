import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Security-critical code must stay explicitly typed.
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      // XSS hardening (PRD §17): never inject raw HTML.
      "react/no-danger": "error",
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
    },
  },
  {
    // Architectural boundary (PRD §12/§14 rules 2, 5, 9): pure verification
    // code and the marketing landing must never reach wallet signing/broadcast.
    files: ["src/features/verification/lib/**/*.ts", "src/features/landing/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@solana/kit-plugin-wallet",
                "@solana/kit-plugin-wallet/*",
                "@solana/wallet-account-signer",
                "@solana/react",
                "@wallet-standard/*",
                "@/features/wallet",
                "@/features/wallet/*",
                "@/features/transfer/lib/submit-transfer",
                "@/features/transfer/lib/sign-transfer",
                "@/features/transfer/hooks/*",
                "@/lib/solana/rpc",
                "@/server/*",
              ],
              message:
                "Landing and pure verification modules must not import wallet signing, RPC send, or server code.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/features/verification/lib/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["react", "react-dom", "next", "next/*", "@/server/*", "@/features/*/components/*"],
              message: "features/verification/lib must stay pure (no React, Next.js, UI, or AI imports).",
            },
            {
              group: [
                "@solana/kit-plugin-wallet",
                "@solana/kit-plugin-wallet/*",
                "@solana/wallet-account-signer",
                "@solana/react",
                "@wallet-standard/*",
                "@/lib/solana/rpc",
                "@/features/transfer/*",
              ],
              message: "Verifier must not depend on wallet, RPC, or transfer orchestration.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/components/ui/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [{ group: ["@/features/*"], message: "UI primitives must not import feature code." }] },
      ],
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "docs/**",
    "playwright-report/**",
    "test-results/**",
    "coverage/**",
    "artifacts/**",
  ]),
]);

export default eslintConfig;
