import { buildClientShimScript } from "./client-shim";
import {
  isAllowedHost,
  isPrimaryTikTokHost,
  PRIMARY_DESKTOP_HOST,
} from "./config";

const UPSTREAM_SPOOFED_ORIGIN = `https://${PRIMARY_DESKTOP_HOST}`;

const STRIPPED_REQUEST_HEADERS = new Set<string>([
  "host",
  "origin",
  "referer",
  "content-length",
  "connection",
  "keep-alive",
  "transfer-encoding",
  "te",
  "trailer",
  "upgrade",
  "proxy-authorization",
  "proxy-connection",
  "accept-encoding",
  "x-real-ip",
  "forwarded",
  "cf-connecting-ip",
  "cf-ray",
  "cf-ipcountry",
  "cf-visitor",
]);

const STRIPPED_RESPONSE_HEADERS = new Set<string>([
  "content-security-policy",
  "content-security-policy-report-only",
  "x-frame-options",
  "strict-transport-security",
  "cross-origin-opener-policy",
  "cross-origin-embedder-policy",
  "cross-origin-resource-policy",
  "content-encoding",
  "transfer-encoding",
]);

const ABSOLUTE_TIKTOK_URL_REGEX =
  /https?:\/\/([a-zA-Z0-9.-]+(?:\.[a-zA-Z0-9.-]+))(\/[^\s"'`<>()\\]*)?/g;

const ESCAPED_TIKTOK_URL_REGEX =
  /https?:\\\/\\\/([a-zA-Z0-9.-]+(?:\.[a-zA-Z0-9.-]+))(\\\/[^\s"'`<>()\\]*)?/g;

const PROTOCOL_RELATIVE_ATTR_REGEX =
  /((?:src|href|action|poster|data-src)\s*=\s*["'])\/\/([a-zA-Z0-9.-]+(?:\.[a-zA-Z0-9.-]+))(\/[^"']*)?(["'])/gi;

const QUOTED_PROTOCOL_RELATIVE_REGEX =
  /(["'`])\/\/([a-zA-Z0-9.-]+(?:\.[a-zA-Z0-9.-]+))(\/[^"'`\s<>\\]*)?\1/g;

const ESCAPED_PROTOCOL_RELATIVE_REGEX =
  /(["'])\\\/\\\/([a-zA-Z0-9.-]+(?:\.[a-zA-Z0-9.-]+))(\\\/[^"'`\s<>\\]*)?\1/g;

const CSS_PROTOCOL_RELATIVE_REGEX =
  /(url\(\s*["']?)\/\/([a-zA-Z0-9.-]+(?:\.[a-zA-Z0-9.-]+))(\/[^)"']*)?(["']?\s*\))/gi;

const SCRIPT_OR_LINK_TAG_REGEX = /<(script|link)\b([^>]*)>/gi;

const INTEGRITY_OR_CROSSORIGIN_ATTR_REGEX =
  /\s+(?:integrity|crossorigin)(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?/gi;

export interface RewriteResponseHeaderOptions {
  forceNoStore?: boolean;
}

/**
 * Builds sanitized upstream request headers, stripping Vercel/proxy headers,
 * preserving all TikTok auth/signature headers (x-tt-*, x-secsdk-*, x-bogus,
 * tt-csrf-token), and force-setting Origin and Referer to https://www.tiktok.com.
 */
export function buildUpstreamHeaders(
  incomingHeaders: Headers,
  targetHost: string,
  targetPath = "/"
): Headers {
  const out = new Headers();

  incomingHeaders.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (
      STRIPPED_REQUEST_HEADERS.has(lower) ||
      lower.startsWith("x-vercel-") ||
      lower.startsWith("x-forwarded-")
    ) {
      return;
    }

    out.set(key, value);
  });

  out.set("host", targetHost);
  out.set("origin", UPSTREAM_SPOOFED_ORIGIN);
  out.set(
    "referer",
    rewriteIncomingReferer(incomingHeaders.get("referer"), targetPath)
  );
  return out;
}

function stripProxyPrefixPath(pathname: string): string {
  for (const prefix of ["/_proxy/", "/internal/proxy/"]) {
    if (pathname.startsWith(prefix)) {
      const rest = pathname.slice(prefix.length);
      const slashIdx = rest.indexOf("/");
      if (slashIdx === -1) {
        return "/";
      }
      return rest.slice(slashIdx) || "/";
    }
  }
  return pathname || "/";
}

function rewriteIncomingReferer(
  rawReferer: string | null,
  fallbackTargetPath: string
): string {
  const safeFallback = fallbackTargetPath.startsWith("/")
    ? fallbackTargetPath
    : `/${fallbackTargetPath}`;
  if (!rawReferer) {
    return `${UPSTREAM_SPOOFED_ORIGIN}${safeFallback}`;
  }
  try {
    const parsed = new URL(rawReferer);
    const originalPath = stripProxyPrefixPath(parsed.pathname);
    return `${UPSTREAM_SPOOFED_ORIGIN}${originalPath}${parsed.search}`;
  } catch {
    return `${UPSTREAM_SPOOFED_ORIGIN}${safeFallback}`;
  }
}

/**
 * Rewrites a single Set-Cookie header so it binds to the Vercel proxy host
 * with Path=/, sets SameSite=None; Secure if Secure was present (otherwise
 * SameSite=Lax), and strictly preserves the original HttpOnly presence/absence
 * so client-side JS can read cookies like passport_csrf_token.
 */
export function rewriteSetCookie(rawCookie: string): string {
  const parts = rawCookie.split(";").map((part) => part.trim());
  const nameValue = parts[0];
  if (!nameValue) {
    return rawCookie;
  }

  const attributes: string[] = [];
  let hasSecure = false;
  let hasHttpOnly = false;

  for (let i = 1; i < parts.length; i++) {
    const attr = parts[i];
    if (!attr) continue;
    const eqIdx = attr.indexOf("=");
    const attrName = (eqIdx === -1 ? attr : attr.slice(0, eqIdx))
      .trim()
      .toLowerCase();

    if (
      attrName === "domain" ||
      attrName === "path" ||
      attrName === "samesite"
    ) {
      continue;
    }
    if (attrName === "secure") {
      hasSecure = true;
      continue;
    }
    if (attrName === "httponly") {
      hasHttpOnly = true;
      continue;
    }
    attributes.push(attr);
  }

  attributes.push("Path=/");
  if (hasHttpOnly) {
    attributes.push("HttpOnly");
  }
  if (hasSecure) {
    attributes.push("SameSite=None");
    attributes.push("Secure");
  } else {
    attributes.push("SameSite=Lax");
  }

  return [nameValue, ...attributes].join("; ");
}

/**
 * Rewrites an upstream Location redirect header to stay inside the proxy.
 */
export function rewriteLocationHeader(
  rawLocation: string,
  currentUpstreamHost: string
): string {
  const trimmed = rawLocation.trim();
  if (!trimmed) return rawLocation;

  try {
    const normalized = trimmed.startsWith("//")
      ? `https:${trimmed}`
      : trimmed;
    const base = `https://${currentUpstreamHost}`;
    const parsed = new URL(normalized, base);

    if (!isAllowedHost(parsed.hostname)) {
      return rawLocation;
    }

    const pathWithQuery = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    if (isPrimaryTikTokHost(parsed.hostname)) {
      return pathWithQuery || "/";
    }

    return `/_proxy/${parsed.hostname}${pathWithQuery}`;
  } catch {
    return rawLocation;
  }
}

/**
 * Rewrites upstream response headers: strips CSP/XFO/HSTS/COOP/COEP,
 * rewrites Location redirects, and rewrites Set-Cookie headers individually.
 */
export function rewriteResponseHeaders(
  upstreamHeaders: Headers,
  currentUpstreamHost: string,
  bodyRewritten: boolean,
  options?: RewriteResponseHeaderOptions
): Headers {
  const out = new Headers();

  upstreamHeaders.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (lower === "set-cookie") {
      return;
    }
    if (STRIPPED_RESPONSE_HEADERS.has(lower)) {
      return;
    }
    if (bodyRewritten && lower === "content-length") {
      return;
    }
    if (lower === "location") {
      out.set("location", rewriteLocationHeader(value, currentUpstreamHost));
      return;
    }
    out.set(key, value);
  });

  if (options?.forceNoStore) {
    out.set("cache-control", "no-store, no-cache, must-revalidate");
    out.set("pragma", "no-cache");
    out.set("expires", "0");
  }

  const setCookies =
    typeof upstreamHeaders.getSetCookie === "function"
      ? upstreamHeaders.getSetCookie()
      : [];

  if (setCookies.length > 0) {
    for (const cookie of setCookies) {
      out.append("Set-Cookie", rewriteSetCookie(cookie));
    }
  } else {
    const singleCookie = upstreamHeaders.get("set-cookie");
    if (singleCookie) {
      out.append("Set-Cookie", rewriteSetCookie(singleCookie));
    }
  }

  return out;
}

/**
 * Rewrites TikTok/ByteDance URLs in HTML, CSS, JS, or JSON text to `/_proxy/<host>/...`.
 */
export function rewriteProxyUrlsInText(text: string): string {
  let rewritten = text.replace(
    ABSOLUTE_TIKTOK_URL_REGEX,
    (fullMatch, host: string, path: string | undefined) => {
      if (!isAllowedHost(host)) {
        return fullMatch;
      }
      return `/_proxy/${host.toLowerCase()}${path ?? ""}`;
    }
  );

  rewritten = rewritten.replace(
    ESCAPED_TIKTOK_URL_REGEX,
    (fullMatch, host: string, path: string | undefined) => {
      if (!isAllowedHost(host)) {
        return fullMatch;
      }
      return `\\/_proxy\\/${host.toLowerCase()}${path ?? ""}`;
    }
  );

  rewritten = rewritten.replace(
    PROTOCOL_RELATIVE_ATTR_REGEX,
    (
      fullMatch,
      prefix: string,
      host: string,
      path: string | undefined,
      suffix: string
    ) => {
      if (!isAllowedHost(host)) {
        return fullMatch;
      }
      return `${prefix}/_proxy/${host.toLowerCase()}${path ?? ""}${suffix}`;
    }
  );

  rewritten = rewritten.replace(
    QUOTED_PROTOCOL_RELATIVE_REGEX,
    (fullMatch, quote: string, host: string, path: string | undefined) => {
      if (!isAllowedHost(host)) {
        return fullMatch;
      }
      return `${quote}/_proxy/${host.toLowerCase()}${path ?? ""}${quote}`;
    }
  );

  rewritten = rewritten.replace(
    ESCAPED_PROTOCOL_RELATIVE_REGEX,
    (fullMatch, quote: string, host: string, path: string | undefined) => {
      if (!isAllowedHost(host)) {
        return fullMatch;
      }
      return `${quote}\\/_proxy\\/${host.toLowerCase()}${path ?? ""}${quote}`;
    }
  );

  rewritten = rewritten.replace(
    CSS_PROTOCOL_RELATIVE_REGEX,
    (
      fullMatch,
      prefix: string,
      host: string,
      path: string | undefined,
      suffix: string
    ) => {
      if (!isAllowedHost(host)) {
        return fullMatch;
      }
      return `${prefix}/_proxy/${host.toLowerCase()}${path ?? ""}${suffix}`;
    }
  );

  return rewritten;
}

/**
 * Strips `integrity` and `crossorigin` attributes from <script> and <link> tags
 * so rewritten/proxied bundles never fail Subresource Integrity checks.
 */
export function stripIntegrityAndCrossorigin(html: string): string {
  return html.replace(
    SCRIPT_OR_LINK_TAG_REGEX,
    (_fullMatch, tagName: string, attrs: string) => {
      const cleanedAttrs = attrs.replace(INTEGRITY_OR_CROSSORIGIN_ATTR_REGEX, "");
      return `<${tagName}${cleanedAttrs}>`;
    }
  );
}

/**
 * Rewrites HTML URLs, strips SRI attributes, and injects the client-side runtime shim into <head>.
 */
export function rewriteHtmlDocument(html: string): string {
  const withoutIntegrity = stripIntegrityAndCrossorigin(html);
  const rewrittenHtml = rewriteProxyUrlsInText(withoutIntegrity);
  const shim = buildClientShimScript();

  if (/<head(\s[^>]*)?>/i.test(rewrittenHtml)) {
    return rewrittenHtml.replace(/<head(\s[^>]*)?>/i, (match) => `${match}\n${shim}`);
  }

  return `${shim}\n${rewrittenHtml}`;
}

/**
 * Determines whether a response Content-Type should be text-rewritten.
 */
export function isHtmlContentType(contentType: string): boolean {
  const lower = contentType.toLowerCase();
  return lower.includes("text/html") || lower.includes("application/xhtml+xml");
}

export function isRewritableTextContentType(contentType: string): boolean {
  const lower = contentType.toLowerCase();
  return (
    lower.includes("text/css") ||
    lower.includes("application/javascript") ||
    lower.includes("text/javascript") ||
    lower.includes("application/x-javascript") ||
    lower.includes("application/json") ||
    lower.includes("application/ld+json")
  );
}
