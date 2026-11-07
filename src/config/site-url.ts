/**
 * Absolute site origin for metadata (Open Graph / Twitter image URLs).
 *
 * Prefers NEXT_PUBLIC_APP_URL. On Vercel, a missing or localhost value would make
 * link previews point at http://localhost:3000, so the deployment's own domain is
 * used instead: the production domain in production, the branch/deployment URL in
 * previews. Server-only: Vercel system variables are not exposed to the browser.
 */
type SiteEnv = Readonly<Record<string, string | undefined>>;

const LOCAL_FALLBACK = "http://localhost:3000";

function toUrl(value: string | undefined): URL | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

function isLocalHost(url: URL): boolean {
  return url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
}

export function resolveSiteUrl(env: SiteEnv = process.env): URL {
  const configured = toUrl(env.NEXT_PUBLIC_APP_URL);
  const onVercel = Boolean(env.VERCEL_ENV);
  if (configured && !(onVercel && isLocalHost(configured))) return configured;

  if (onVercel) {
    const host =
      env.VERCEL_ENV === "production"
        ? (env.VERCEL_PROJECT_PRODUCTION_URL ?? env.VERCEL_URL)
        : (env.VERCEL_BRANCH_URL ?? env.VERCEL_URL);
    const deployment = toUrl(host ? `https://${host}` : undefined);
    if (deployment) return deployment;
  }
  return configured ?? new URL(LOCAL_FALLBACK);
}
