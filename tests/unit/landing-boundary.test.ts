import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * LP-11 / PRD §12 boundary: walk the real import graph starting from every
 * landing module and prove it never reaches wallet signing, RPC send/confirm,
 * or server code. A static check of actual source, not a convention.
 */
const ROOT = resolve(__dirname, "../..");
const SRC = join(ROOT, "src");

const FORBIDDEN_PACKAGES = [
  "@solana/kit-plugin-wallet",
  "@solana/wallet-account-signer",
  "@solana/react",
  "@wallet-standard/",
  "server-only",
];

const FORBIDDEN_MODULES = [
  "src/features/transfer/lib/sign-transfer.ts",
  "src/features/transfer/lib/submit-transfer.ts",
  "src/features/transfer/lib/confirm-transfer.ts",
  "src/features/transfer/lib/prepare-transfer.ts",
  "src/features/transfer/lib/simulate-transfer.ts",
  "src/features/transfer/hooks/use-transfer-machine.ts",
  "src/lib/solana/rpc.ts",
  "src/lib/solana/client.ts",
  "src/features/wallet/wallet-client.ts",
];

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? listFiles(full) : /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

const IMPORT_RE = /(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;

function resolveLocal(from: string, specifier: string): string | null {
  const base = specifier.startsWith("@/") ? join(SRC, specifier.slice(2)) : resolve(dirname(from), specifier);
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function importGraph(entries: string[]) {
  const visited = new Set<string>();
  const packages = new Set<string>();
  const stack = [...entries];
  while (stack.length > 0) {
    const file = stack.pop()!;
    if (visited.has(file)) continue;
    visited.add(file);
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(IMPORT_RE)) {
      const specifier = match[1] ?? match[2];
      if (!specifier) continue;
      if (specifier.startsWith(".") || specifier.startsWith("@/")) {
        const target = resolveLocal(file, specifier);
        if (target) stack.push(target);
      } else {
        packages.add(specifier);
      }
    }
  }
  return { files: [...visited].map((f) => relative(ROOT, f).replace(/\\/g, "/")), packages: [...packages] };
}

describe("landing import boundary (LP-11)", () => {
  const landingFiles = listFiles(join(SRC, "features", "landing"));
  const marketingPage = join(SRC, "app", "(marketing)", "page.tsx");
  const graph = importGraph([...landingFiles, marketingPage]);

  it("walks a non-trivial graph", () => {
    expect(graph.files.length).toBeGreaterThan(20);
    expect(graph.files).toContain("src/features/verification/lib/verify-native-sol-transfer.ts");
  });

  it("never reaches signing, broadcasting, confirmation, RPC, or wallet modules", () => {
    for (const forbidden of FORBIDDEN_MODULES) expect(graph.files).not.toContain(forbidden);
  });

  it("never imports wallet or server-only packages", () => {
    for (const pkg of graph.packages) {
      for (const forbidden of FORBIDDEN_PACKAGES) expect(pkg.startsWith(forbidden)).toBe(false);
    }
  });

  it("landing source never references wallet signing or send APIs", () => {
    for (const file of landingFiles) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toMatch(/modifyAndSignTransactions|signAndSendTransaction|sendTransaction\(|requestAirdrop/);
    }
  });

  it("demo fixtures never reference a real Explorer transaction", () => {
    for (const file of landingFiles) {
      expect(readFileSync(file, "utf8")).not.toMatch(/explorer\.solana\.com\/tx\//);
    }
  });
});

describe("pure verifier boundary (PRD §14 rule 2)", () => {
  const verifierFiles = listFiles(join(SRC, "features", "verification", "lib"));
  const graph = importGraph(verifierFiles);

  it("imports no React, Next.js, AI, wallet or RPC code", () => {
    for (const pkg of graph.packages) {
      expect(pkg).not.toMatch(/^(react|react-dom|next|server-only)(\/|$)/);
      expect(pkg).not.toMatch(/^@solana\/(kit-plugin-wallet|react|wallet-account-signer)/);
    }
    for (const file of graph.files) {
      expect(file).not.toMatch(/src\/(server|app)\//);
      expect(file).not.toMatch(/src\/features\/(transfer|wallet|landing)\//);
      expect(file).not.toBe("src/lib/solana/rpc.ts");
    }
  });
});

describe("secrets stay server-side", () => {
  it("no client-reachable module reads server-only AI env vars", () => {
    const clientRoots = [join(SRC, "features"), join(SRC, "components"), join(SRC, "lib"), join(SRC, "config")];
    for (const file of clientRoots.flatMap(listFiles)) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(/OPENROUTER_API_KEY|AI_BASE_URL/);
    }
  });

  it("server AI modules are marked server-only", () => {
    for (const file of listFiles(join(SRC, "server"))) {
      expect(readFileSync(file, "utf8"), file).toMatch(/import "server-only";/);
    }
  });
});
