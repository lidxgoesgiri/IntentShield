import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

/**
 * The browser talks to exactly one Solana RPC origin (Devnet). Everything else
 * is same-origin. Derive the allowed connect-src from the configured RPC URL so
 * an accidental extra endpoint is blocked by CSP rather than silently reached.
 */
function rpcConnectSources(): string[] {
  const raw = process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
  try {
    const url = new URL(raw);
    const wsProtocol = url.protocol === "https:" ? "wss:" : "ws:";
    return [url.origin, `${wsProtocol}//${url.host}`];
  } catch {
    return [];
  }
}

const contentSecurityPolicy = [
  "default-src 'self'",
  // Next.js App Router hydration uses inline scripts; nonce-based CSP would force
  // every route to render dynamically. Trade-off documented in docs/ARCHITECTURE.md.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  // React delegates events; inline HTML on* handlers are never required.
  "script-src-attr 'none'",
  "style-src 'self' 'unsafe-inline'",
  // Wallet Standard icons are data: URIs.
  "img-src 'self' data: blob:",
  "font-src 'self'",
  `connect-src 'self' ${rpcConnectSources().join(" ")}${isDev ? " ws://localhost:* ws://127.0.0.1:*" : ""}`,
  "worker-src 'self' blob:",
  "object-src 'none'",
  "frame-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: true,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
          },
        ],
      },
      {
        // AI and health responses must never be cached by shared caches.
        source: "/api/(.*)",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
    ];
  },
};

export default nextConfig;
