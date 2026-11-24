const PAGE_HOST_SUFFIXES = [
  "tiktok.com",
  "tiktokv.com",
  "byteoversea.com",
  "musical.ly",
] as const;

const CDN_HOST_SUFFIXES = [
  "tiktokcdn.com",
  "tiktokcdn-us.com",
  "tiktokcdn-eu.com",
  "tiktokcdn-in.com",
  "tiktokv.com",
  "tiktokv.us",
  "byteoversea.com",
  "ibytedtos.com",
  "ibyteimg.com",
  "muscdn.com",
  "musical.ly",
  "tiktok.com",
] as const;

const PRIVATE_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\./,
  /^::1$/,
  /^fc00:/i,
  /^fd00:/i,
  /^fe80:/i,
  /^localhost$/i,
];

function matchesHostSuffix(hostname: string, suffixes: readonly string[]): boolean {
  const normalized = hostname.toLowerCase().replace(/\.+$/, "");
  if (!normalized) return false;
  if (PRIVATE_IP_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return false;
  }
  return suffixes.some(
    (suffix) => normalized === suffix || normalized.endsWith(`.${suffix}`)
  );
}

export function isAllowedTikTokPageUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return false;
    }
    if (parsed.username || parsed.password) {
      return false;
    }
    if (parsed.port && parsed.port !== "80" && parsed.port !== "443") {
      return false;
    }
    return matchesHostSuffix(parsed.hostname, PAGE_HOST_SUFFIXES);
  } catch {
    return false;
  }
}

export function isAllowedTikTokCdnUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return false;
    }
    if (parsed.username || parsed.password) {
      return false;
    }
    if (parsed.port && parsed.port !== "80" && parsed.port !== "443") {
      return false;
    }
    return matchesHostSuffix(parsed.hostname, CDN_HOST_SUFFIXES);
  } catch {
    return false;
  }
}

export function buildProxyStreamUrl(
  rawCdnUrl: string | undefined | null,
  options?: { download?: boolean; filename?: string }
): string {
  if (!rawCdnUrl) return "";
  const trimmed = rawCdnUrl.trim();
  if (!trimmed || !isAllowedTikTokCdnUrl(trimmed)) {
    return "";
  }
  const params = new URLSearchParams({ url: trimmed });
  if (options?.download) {
    params.set("download", "1");
  }
  if (options?.filename) {
    const safeName = options.filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
    if (safeName) {
      params.set("filename", safeName);
    }
  }
  return `/api/stream?${params.toString()}`;
}

export function extractVideoIdFromUrl(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl);
    const videoMatch = parsed.pathname.match(/\/video\/(\d+)/i);
    if (videoMatch?.[1]) return videoMatch[1];

    const photoMatch = parsed.pathname.match(/\/photo\/(\d+)/i);
    if (photoMatch?.[1]) return photoMatch[1];

    const vParam = parsed.searchParams.get("item_id") || parsed.searchParams.get("v");
    if (vParam && /^\d+$/.test(vParam)) return vParam;

    return null;
  } catch {
    return null;
  }
}

export function extractUsernameFromUrl(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl);
    const match = parsed.pathname.match(/^\/@([a-zA-Z0-9._-]+)/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

export function sanitizeUsername(input: string): string | null {
  const cleaned = input.trim().replace(/^@+/, "");
  if (!cleaned) return null;
  if (!/^[a-zA-Z0-9._]{1,32}$/.test(cleaned)) {
    return null;
  }
  return cleaned;
}

export function sanitizeHashtag(input: string): string | null {
  const cleaned = input.trim().replace(/^#+/, "");
  if (!cleaned) return null;
  if (!/^[\p{L}\p{N}_]{1,64}$/u.test(cleaned)) {
    return null;
  }
  return cleaned;
}

export type ClassifiedQuery =
  | { kind: "url"; url: string }
  | { kind: "username"; username: string }
  | { kind: "hashtag"; tag: string }
  | { kind: "trending" }
  | { kind: "invalid"; reason: string };

export function classifyQuery(rawInput: string): ClassifiedQuery {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return { kind: "invalid", reason: "Enter a TikTok URL, @username, or #hashtag." };
  }

  if (trimmed.toLowerCase() === "trending" || trimmed.toLowerCase() === "explore") {
    return { kind: "trending" };
  }

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    if (!isAllowedTikTokPageUrl(trimmed)) {
      return {
        kind: "invalid",
        reason: "Only TikTok URLs (tiktok.com, vm.tiktok.com, vt.tiktok.com) are supported.",
      };
    }
    return { kind: "url", url: trimmed };
  }

  if (/^(www\.|m\.|vm\.|vt\.)?tiktok\.com\//i.test(trimmed)) {
    const withProtocol = `https://${trimmed}`;
    if (!isAllowedTikTokPageUrl(withProtocol)) {
      return { kind: "invalid", reason: "Invalid TikTok URL." };
    }
    return { kind: "url", url: withProtocol };
  }

  if (trimmed.startsWith("#")) {
    const tag = sanitizeHashtag(trimmed);
    if (!tag) {
      return { kind: "invalid", reason: "Invalid hashtag format." };
    }
    return { kind: "hashtag", tag };
  }

  const username = sanitizeUsername(trimmed);
  if (username) {
    return { kind: "username", username };
  }

  return {
    kind: "invalid",
    reason: "Enter a valid TikTok video URL, @username, or #hashtag.",
  };
}
