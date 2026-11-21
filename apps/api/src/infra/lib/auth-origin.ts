export interface AuthOriginConfig {
  isVercel: boolean;
  fallbackOrigin: string;
  allowedHosts: string[];
  trustedOrigins: string[];
}

function cleanValue(raw?: string): string {
  return (raw ?? "")
    .trim()
    .replace(/^['"]|['"]$/g, "")
    .replace(/\/+$/, "");
}

/**
 * Normalizes a URL or bare hostname into a canonical origin (scheme + host).
 */
export function normalizeOrigin(raw?: string): string | undefined {
  const cleaned = cleanValue(raw);
  if (!cleaned) return undefined;

  const withScheme = /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(cleaned) ? cleaned : `https://${cleaned}`;

  try {
    const parsed = new URL(withScheme);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return undefined;
    }
    return parsed.origin;
  } catch {
    return undefined;
  }
}

/**
 * Returns true if the URL or hostname points to a loopback/localhost address.
 */
export function isLocalhostOrigin(origin?: string): boolean {
  const cleaned = cleanValue(origin);
  if (!cleaned) return false;

  const withScheme = /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(cleaned) ? cleaned : `http://${cleaned}`;

  try {
    const { hostname } = new URL(withScheme);
    const normalized = hostname.toLowerCase();
    return (
      normalized === "localhost" ||
      normalized.endsWith(".localhost") ||
      normalized === "127.0.0.1" ||
      normalized === "::1" ||
      normalized === "[::1]"
    );
  } catch {
    const hostPart = extractHost(cleaned)?.toLowerCase() ?? "";
    return (
      hostPart === "localhost" ||
      hostPart.startsWith("localhost:") ||
      hostPart === "127.0.0.1" ||
      hostPart.startsWith("127.0.0.1:") ||
      hostPart === "::1" ||
      hostPart.startsWith("[::1]")
    );
  }
}

/**
 * Extracts host (including port or wildcard, without scheme or path) from a URL, hostname, or pattern.
 */
export function extractHost(urlOrHost?: string): string | undefined {
  const cleaned = cleanValue(urlOrHost);
  if (!cleaned) return undefined;

  const withoutScheme = cleaned.replace(/^https?:\/\//i, "");
  const slashIdx = withoutScheme.indexOf("/");
  const host = (slashIdx === -1 ? withoutScheme : withoutScheme.slice(0, slashIdx)).trim();
  return host || undefined;
}

/**
 * Builds dynamic Better Auth origin & host allowlists from runtime environment variables.
 * Prevents stale localhost env vars from poisoning Vercel preview/production deployments.
 */
export function buildAuthOriginConfig(env: NodeJS.ProcessEnv = process.env): AuthOriginConfig {
  const isVercel = env.VERCEL === "1" || Boolean(env.VERCEL_ENV);

  const getSafeEnvOrigin = (raw?: string): string | undefined => {
    const origin = normalizeOrigin(raw);
    if (!origin) return undefined;
    if (isVercel && isLocalhostOrigin(origin)) {
      return undefined;
    }
    return origin;
  };

  const vercelOrigin =
    env.VERCEL_ENV === "production"
      ? normalizeOrigin(env.VERCEL_PROJECT_PRODUCTION_URL || env.VERCEL_URL)
      : normalizeOrigin(env.VERCEL_URL);

  const safeBetterAuthUrl = getSafeEnvOrigin(env.BETTER_AUTH_URL);
  const safeNextPublicAppUrl = getSafeEnvOrigin(env.NEXT_PUBLIC_APP_URL);

  const fallbackOrigin =
    safeBetterAuthUrl || vercelOrigin || safeNextPublicAppUrl || "http://localhost:5002";

  const configuredTrustedOrigins = (env.BETTER_AUTH_TRUSTED_ORIGINS ?? "")
    .split(",")
    .map((entry) => cleanValue(entry))
    .filter(Boolean)
    .filter((entry) => !(isVercel && isLocalhostOrigin(entry)));

  const allowedHosts = Array.from(
    new Set(
      [
        extractHost(fallbackOrigin),
        extractHost(safeBetterAuthUrl),
        extractHost(safeNextPublicAppUrl),
        extractHost(env.VERCEL_PROJECT_PRODUCTION_URL),
        extractHost(env.VERCEL_BRANCH_URL),
        extractHost(env.VERCEL_URL),
        ...configuredTrustedOrigins.map((entry) => extractHost(entry)),
        ...(isVercel
          ? ["qrew-*.vercel.app"]
          : ["localhost", "localhost:*", "127.0.0.1", "127.0.0.1:*"]),
      ].filter((host): host is string => Boolean(host)),
    ),
  );

  const trustedOrigins = Array.from(
    new Set(
      [
        fallbackOrigin,
        safeBetterAuthUrl,
        safeNextPublicAppUrl,
        normalizeOrigin(env.VERCEL_PROJECT_PRODUCTION_URL),
        normalizeOrigin(env.VERCEL_BRANCH_URL),
        normalizeOrigin(env.VERCEL_URL),
        ...configuredTrustedOrigins,
        ...(isVercel
          ? ["https://qrew-*.vercel.app"]
          : ["http://localhost:5002", "http://localhost:3001", "http://127.0.0.1:5002"]),
      ].filter((origin): origin is string => Boolean(origin)),
    ),
  );

  return {
    isVercel,
    fallbackOrigin,
    allowedHosts,
    trustedOrigins,
  };
}

/**
 * Resolves the canonical application origin for server-generated links (invites, password resets).
 */
export function resolveAppOrigin(env: NodeJS.ProcessEnv = process.env): string {
  return buildAuthOriginConfig(env).fallbackOrigin;
}
