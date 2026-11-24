import type {
  TikTokErrorCode,
  TikTokUserProfile,
  TikTokVideoItem,
} from "@/types/tiktok";
import { parseOEmbedPayload, parseTikTokHtml } from "./parser";
import {
  extractUsernameFromUrl,
  extractVideoIdFromUrl,
  isAllowedTikTokPageUrl,
  sanitizeHashtag,
  sanitizeUsername,
} from "./security";

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
] as const;

export function pickUserAgent(): string {
  const index = Math.floor(Math.random() * USER_AGENTS.length);
  return USER_AGENTS[index] ?? USER_AGENTS[0];
}

export function getBrowserHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    "User-Agent": pickUserAgent(),
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
    Referer: "https://www.tiktok.com/",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    ...extra,
  };
}

export class TikTokFetchError extends Error {
  public readonly code: TikTokErrorCode;
  public readonly statusCode: number;
  public readonly retryable: boolean;

  constructor(
    code: TikTokErrorCode,
    message: string,
    statusCode = 502,
    retryable = false
  ) {
    super(message);
    this.name = "TikTokFetchError";
    this.code = code;
    this.statusCode = statusCode;
    this.retryable = retryable;
  }
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

class LruTtlCache<T> {
  private readonly store = new Map<string, CacheEntry<T>>();
  private readonly maxEntries: number;
  private readonly ttlMs: number;

  constructor(maxEntries = 150, ttlMs = 5 * 60 * 1000) {
    this.maxEntries = maxEntries;
    this.ttlMs = ttlMs;
  }

  get(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    // Refresh LRU order
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T): void {
    if (this.store.has(key)) {
      this.store.delete(key);
    } else if (this.store.size >= this.maxEntries) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) {
        this.store.delete(oldestKey);
      }
    }
    this.store.set(key, {
      value,
      expiresAt: Date.now() + this.ttlMs,
    });
  }
}

const videoCache = new LruTtlCache<TikTokVideoItem>(200, 5 * 60 * 1000);
const profileCache = new LruTtlCache<TikTokUserProfile>(100, 5 * 60 * 1000);
const listCache = new LruTtlCache<TikTokVideoItem[]>(60, 3 * 60 * 1000);

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = 5500
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchHtmlWithRetry(url: string, maxAttempts = 2): Promise<string> {
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      const delay = 250 * Math.pow(2, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    try {
      const response = await fetchWithTimeout(
        url,
        {
          method: "GET",
          headers: getBrowserHeaders(),
          redirect: "follow",
        },
        5500
      );

      if (response.status === 429) {
        lastError = new TikTokFetchError(
          "RATE_LIMITED",
          "TikTok rate-limited the gateway. Please wait a moment and retry.",
          429,
          true
        );
        continue;
      }

      if (response.status === 404) {
        throw new TikTokFetchError(
          "NOT_FOUND",
          "This TikTok video or creator could not be found.",
          404,
          false
        );
      }

      if (response.status === 403 || response.status >= 500) {
        lastError = new TikTokFetchError(
          "UPSTREAM_BLOCKED",
          `Upstream returned HTTP ${response.status}.`,
          502,
          true
        );
        continue;
      }

      const html = await response.text();
      if (!html || html.length < 200) {
        lastError = new TikTokFetchError(
          "UPSTREAM_BLOCKED",
          "Upstream returned an empty response.",
          502,
          true
        );
        continue;
      }

      return html;
    } catch (err) {
      if (err instanceof TikTokFetchError) {
        if (!err.retryable) throw err;
        lastError = err;
      } else {
        lastError = err;
      }
    }
  }

  if (lastError instanceof TikTokFetchError) {
    throw lastError;
  }

  throw new TikTokFetchError(
    "UPSTREAM_BLOCKED",
    "Unable to reach TikTok upstream servers in time.",
    504,
    true
  );
}

export async function canonicalizeTikTokUrl(rawUrl: string): Promise<string> {
  if (!isAllowedTikTokPageUrl(rawUrl)) {
    throw new TikTokFetchError(
      "INVALID_URL",
      "URL is not an allowed TikTok domain.",
      400,
      false
    );
  }

  let currentUrl = rawUrl;
  const maxRedirects = 5;

  for (let i = 0; i < maxRedirects; i++) {
    const parsed = new URL(currentUrl);
    const isShortHost =
      parsed.hostname === "vm.tiktok.com" ||
      parsed.hostname === "vt.tiktok.com" ||
      parsed.hostname === "t.tiktok.com";

    if (!isShortHost && extractVideoIdFromUrl(currentUrl)) {
      return currentUrl;
    }

    if (!isShortHost && i > 0) {
      return currentUrl;
    }

    if (!isShortHost) {
      return currentUrl;
    }

    const res = await fetchWithTimeout(
      currentUrl,
      {
        method: "HEAD",
        headers: getBrowserHeaders(),
        redirect: "manual",
      },
      4000
    ).catch(() =>
      fetchWithTimeout(
        currentUrl,
        {
          method: "GET",
          headers: getBrowserHeaders(),
          redirect: "manual",
        },
        4000
      )
    );

    const location = res.headers.get("location");
    if (!location) {
      return currentUrl;
    }

    const resolved = new URL(location, currentUrl).toString();
    if (!isAllowedTikTokPageUrl(resolved)) {
      throw new TikTokFetchError(
        "INVALID_URL",
        "Short link redirected outside allowed TikTok domains.",
        400,
        false
      );
    }

    currentUrl = resolved;
  }

  return currentUrl;
}

async function fetchOEmbedFallback(
  canonicalUrl: string,
  videoId: string
): Promise<TikTokVideoItem | null> {
  try {
    const oembedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(
      canonicalUrl
    )}`;
    const res = await fetchWithTimeout(
      oembedUrl,
      {
        method: "GET",
        headers: {
          "User-Agent": pickUserAgent(),
          Accept: "application/json",
        },
      },
      4000
    );
    if (!res.ok) return null;
    const json: unknown = await res.json();
    return parseOEmbedPayload(json, canonicalUrl, videoId);
  } catch {
    return null;
  }
}

export async function resolveTikTokVideo(rawUrl: string): Promise<{
  video: TikTokVideoItem;
  source: "rehydration" | "oembed" | "cache";
  warning?: string;
}> {
  const canonicalUrl = await canonicalizeTikTokUrl(rawUrl);
  const videoId = extractVideoIdFromUrl(canonicalUrl);
  const cacheKey = videoId ? `vid:${videoId}` : `url:${canonicalUrl}`;

  const cached = videoCache.get(cacheKey);
  if (cached) {
    return { video: cached, source: "cache" };
  }

  let htmlError: TikTokFetchError | null = null;
  try {
    const html = await fetchHtmlWithRetry(canonicalUrl);
    const parsed = parseTikTokHtml(html);

    if (parsed.video) {
      videoCache.set(cacheKey, parsed.video);
      return { video: parsed.video, source: "rehydration" };
    }

    if (parsed.statusCode === 10204 || parsed.statusCode === 10221) {
      throw new TikTokFetchError(
        "NOT_FOUND",
        "This video is unavailable or has been removed.",
        404,
        false
      );
    }

    if (parsed.statusCode === 10222) {
      throw new TikTokFetchError(
        "PRIVATE_ACCOUNT",
        "This video belongs to a private account.",
        403,
        false
      );
    }

    if (parsed.statusCode === 10216) {
      throw new TikTokFetchError(
        "REGION_LOCKED",
        "This video is region-locked by TikTok.",
        451,
        false
      );
    }
  } catch (err) {
    if (err instanceof TikTokFetchError) {
      if (!err.retryable && err.code !== "UPSTREAM_BLOCKED") {
        throw err;
      }
      htmlError = err;
    } else {
      htmlError = new TikTokFetchError(
        "UPSTREAM_BLOCKED",
        "Could not parse video metadata from TikTok.",
        502,
        true
      );
    }
  }

  // Fallback to oEmbed so thumbnail, author, and caption still render
  const oembedVideo = await fetchOEmbedFallback(canonicalUrl, videoId ?? "");
  if (oembedVideo) {
    return {
      video: oembedVideo,
      source: "oembed",
      warning:
        "Full video stream is temporarily throttled by TikTok. Showing preview metadata via oEmbed — click Retry for full playback.",
    };
  }

  throw (
    htmlError ??
    new TikTokFetchError(
      "UPSTREAM_BLOCKED",
      "TikTok blocked metadata extraction. Please retry in a moment.",
      502,
      true
    )
  );
}

export async function fetchTikTokProfile(rawUsername: string): Promise<{
  profile: TikTokUserProfile;
  source: "rehydration" | "cache";
  warning?: string;
}> {
  const username = sanitizeUsername(rawUsername);
  if (!username) {
    throw new TikTokFetchError(
      "INVALID_URL",
      "Invalid TikTok username format.",
      400,
      false
    );
  }

  const cacheKey = `user:${username.toLowerCase()}`;
  const cached = profileCache.get(cacheKey);
  if (cached) {
    return { profile: cached, source: "cache" };
  }

  const profileUrl = `https://www.tiktok.com/@${encodeURIComponent(username)}`;
  const html = await fetchHtmlWithRetry(profileUrl);
  const parsed = parseTikTokHtml(html);

  if (!parsed.profile) {
    if (parsed.statusCode === 10221 || parsed.statusCode === 10202) {
      throw new TikTokFetchError(
        "NOT_FOUND",
        `Creator @${username} does not exist.`,
        404,
        false
      );
    }
    throw new TikTokFetchError(
      "UPSTREAM_BLOCKED",
      `Unable to extract profile data for @${username}. TikTok may be rate-limiting requests.`,
      502,
      true
    );
  }

  const profile = parsed.profile;
  if (profile.privateAccount) {
    return {
      profile: { ...profile, videos: [] },
      source: "rehydration",
      warning: `@${profile.uniqueId} is a private account.`,
    };
  }

  profileCache.set(cacheKey, profile);

  const warning =
    profile.videos.length === 0 && profile.videoCount > 0
      ? "Profile loaded, but TikTok withheld the public video feed for this request. Retry or paste a specific video URL."
      : undefined;

  return {
    profile: {
      ...profile,
      partial: Boolean(warning),
    },
    source: "rehydration",
    warning,
  };
}

export async function fetchTikTokHashtag(rawTag: string): Promise<{
  videos: TikTokVideoItem[];
  source: "rehydration" | "cache";
}> {
  const tag = sanitizeHashtag(rawTag);
  if (!tag) {
    throw new TikTokFetchError(
      "INVALID_URL",
      "Invalid hashtag format.",
      400,
      false
    );
  }

  const cacheKey = `tag:${tag.toLowerCase()}`;
  const cached = listCache.get(cacheKey);
  if (cached) {
    return { videos: cached, source: "cache" };
  }

  const url = `https://www.tiktok.com/tag/${encodeURIComponent(tag)}`;
  const html = await fetchHtmlWithRetry(url);
  const parsed = parseTikTokHtml(html);

  if (parsed.videos.length === 0) {
    throw new TikTokFetchError(
      "UPSTREAM_BLOCKED",
      `No public videos could be extracted for #${tag} right now.`,
      502,
      true
    );
  }

  listCache.set(cacheKey, parsed.videos);
  return { videos: parsed.videos, source: "rehydration" };
}

export async function fetchTikTokTrending(): Promise<{
  videos: TikTokVideoItem[];
  source: "rehydration" | "cache";
}> {
  const cacheKey = "trending:explore";
  const cached = listCache.get(cacheKey);
  if (cached) {
    return { videos: cached, source: "cache" };
  }

  const url = "https://www.tiktok.com/explore";
  const html = await fetchHtmlWithRetry(url);
  const parsed = parseTikTokHtml(html);

  if (parsed.videos.length === 0) {
    throw new TikTokFetchError(
      "UPSTREAM_BLOCKED",
      "Trending feed is temporarily throttled by TikTok.",
      502,
      true
    );
  }

  listCache.set(cacheKey, parsed.videos);
  return { videos: parsed.videos, source: "rehydration" };
}

export function extractTargetFromCanonicalUrl(canonicalUrl: string): {
  kind: "video" | "profile";
  id: string;
} {
  const videoId = extractVideoIdFromUrl(canonicalUrl);
  if (videoId) {
    return { kind: "video", id: videoId };
  }
  const username = extractUsernameFromUrl(canonicalUrl);
  if (username) {
    return { kind: "profile", id: username };
  }
  return { kind: "video", id: "" };
}
