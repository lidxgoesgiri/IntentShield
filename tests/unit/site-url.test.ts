import { describe, expect, it } from "vitest";
import { resolveSiteUrl } from "@/config/site-url";

const PROD_DOMAIN = "intent-shield-self.vercel.app";

describe("resolveSiteUrl (metadataBase for link previews)", () => {
  it("uses an explicit https NEXT_PUBLIC_APP_URL everywhere", () => {
    const env = { NEXT_PUBLIC_APP_URL: "https://intentshield.example", VERCEL_ENV: "production", VERCEL_PROJECT_PRODUCTION_URL: PROD_DOMAIN };
    expect(resolveSiteUrl(env).origin).toBe("https://intentshield.example");
  });

  it("falls back to the Vercel production domain when the app URL is unset", () => {
    expect(resolveSiteUrl({ VERCEL_ENV: "production", VERCEL_PROJECT_PRODUCTION_URL: PROD_DOMAIN }).origin).toBe(`https://${PROD_DOMAIN}`);
  });

  it("never lets a localhost app URL reach a Vercel deployment", () => {
    const env = { NEXT_PUBLIC_APP_URL: "http://localhost:3000", VERCEL_ENV: "production", VERCEL_PROJECT_PRODUCTION_URL: PROD_DOMAIN };
    expect(resolveSiteUrl(env).origin).toBe(`https://${PROD_DOMAIN}`);
  });

  it("uses the branch URL on preview deployments", () => {
    const env = { VERCEL_ENV: "preview", VERCEL_BRANCH_URL: "intent-shield-git-fix-x.vercel.app", VERCEL_URL: "intent-shield-abc123.vercel.app" };
    expect(resolveSiteUrl(env).origin).toBe("https://intent-shield-git-fix-x.vercel.app");
  });

  it("keeps localhost for local development", () => {
    expect(resolveSiteUrl({}).origin).toBe("http://localhost:3000");
    expect(resolveSiteUrl({ NEXT_PUBLIC_APP_URL: "http://localhost:3100" }).origin).toBe("http://localhost:3100");
  });

  it("ignores malformed or non-http values", () => {
    expect(resolveSiteUrl({ NEXT_PUBLIC_APP_URL: "not a url" }).origin).toBe("http://localhost:3000");
    expect(resolveSiteUrl({ NEXT_PUBLIC_APP_URL: "javascript:alert(1)", VERCEL_ENV: "production", VERCEL_PROJECT_PRODUCTION_URL: PROD_DOMAIN }).origin).toBe(
      `https://${PROD_DOMAIN}`,
    );
  });
});
