export const PRIMARY_DESKTOP_HOST = "www.tiktok.com";
export const PRIMARY_MOBILE_HOST = "m.tiktok.com";

export const VERCEL_PAYLOAD_LIMIT_BYTES = 4_718_592; // 4.5 MiB

export const ALLOWED_EXACT_HOSTS = new Set<string>([
  "www.tiktok.com",
  "m.tiktok.com",
  "vm.tiktok.com",
  "vt.tiktok.com",
  "tiktok.com",
]);

export const ALLOWED_DOMAIN_SUFFIXES: readonly string[] = [
  "tiktok.com",
  "tiktokv.com",
  "tiktokv.us",
  "tiktokv.eu",
  "tiktokw.us",
  "tiktokw.eu",
  "tiktokcdn.com",
  "tiktokcdn-eu.com",
  "tiktokcdn-us.com",
  "ttwstatic.com",
  "byteoversea.com",
  "bytedance.com",
  "bytedanceapi.com",
  "byteintl.com",
  "bytegecko.com",
  "ibytedtos.com",
  "ibyteimg.com",
  "muscdn.com",
  "snssdk.com",
  "sgsnssdk.com",
];

const HOSTNAME_REGEX =
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

const MOBILE_UA_REGEX =
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i;

/**
 * Validates that a target hostname strictly belongs to an official TikTok or
 * ByteDance domain to prevent open-proxy SSRF abuse.
 */
export function isAllowedHost(rawHost: string): boolean {
  if (!rawHost || typeof rawHost !== "string") {
    return false;
  }

  const host = rawHost.trim().toLowerCase();

  // Reject ports, credentials, paths, or invalid hostname syntax
  if (
    host.includes(":") ||
    host.includes("@") ||
    host.includes("/") ||
    host.includes("\\") ||
    !HOSTNAME_REGEX.test(host)
  ) {
    return false;
  }

  // Reject numeric IPv4 addresses
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) {
    return false;
  }

  if (ALLOWED_EXACT_HOSTS.has(host)) {
    return true;
  }

  return ALLOWED_DOMAIN_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`)
  );
}

/**
 * Selects www.tiktok.com or m.tiktok.com based on the incoming User-Agent.
 */
export function getPrimaryUpstreamHost(userAgent: string | null): string {
  if (userAgent && MOBILE_UA_REGEX.test(userAgent)) {
    return PRIMARY_MOBILE_HOST;
  }
  return PRIMARY_DESKTOP_HOST;
}

/**
 * Determines whether a hostname should be mapped to root `/` instead of `/_proxy/<host>`
 * for top-level document navigation.
 */
export function isPrimaryTikTokHost(host: string): boolean {
  const normalized = host.trim().toLowerCase();
  return normalized === PRIMARY_DESKTOP_HOST || normalized === PRIMARY_MOBILE_HOST;
}
