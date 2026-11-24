import { buildClientShimScript } from "./client-shim";
import { isAllowedHost, isPrimaryTikTokHost } from "./config";

const STRIPPED_REQUEST_HEADERS = new Set<string>([
  "host",
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

const CSS_PROTOCOL_RELATIVE_REGEX =
  /(url\(\s*["']?)\/\/([a-zA-Z0-9.-]+(?:\.[a-zA-Z0-9.-]+))(\/[^)"']*)?(["']?\s*\))/gi;

/**
 * Builds sanitized upstream request headers, stripping Vercel/proxy headers
 * and rewriting Origin/Referer to match the upstream TikTok host.
 */
export function buildUpstreamHeaders(
  incomingHeaders: Headers,
  targetHost: string
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

    if (lower === "origin") {
      out.set("origin", `https://${targetHost}`);
      return;
    }

    if (lower === "referer") {
      out.set("referer", rewriteIncomingReferer(value, targetHost));
      return;
    }

    out.set(key, value);
  });

  out.set("host", targetHost);
  return out;
}

function rewriteIncomingReferer(rawReferer: string, targetHost: string): string {
  try {
    const parsed = new URL(rawReferer);
    if (parsed.pathname.startsWith("/_proxy/")) {
      const rest = parsed.pathname.slice("/_proxy/".length);
      const slashIdx = rest.indexOf("/");
      if (slashIdx === -1) {
        if (isAllowedHost(rest)) {
          return `https://${rest}/`;
        }
      } else {
        const refHost = rest.slice(0, slashIdx);
        const refPath = rest.slice(slashIdx);
        if (isAllowedHost(refHost)) {
          return `https://${refHost}${refPath}${parsed.search}`;
        }
      }
    }
    return `https://${targetHost}${parsed.pathname}${parsed.search}`;
  } catch {
    return `https://${targetHost}/`;
  }
}

/**
 * Rewrites a single Set-Cookie header so it is scoped to the Vercel host
 * with SameSite=None; Secure while preserving HttpOnly and Path=/.
 */
export function rewriteSetCookie(rawCookie: string): string {
  const parts = rawCookie.split(";").map((part) => part.trim());
  const nameValue = parts[0];
  if (!nameValue) {
    return rawCookie;
  }

  const attributes: string[] = [];
  let hasPath = false;

  for (let i = 1; i < parts.length; i++) {
    const attr = parts[i];
    if (!attr) continue;
    const eqIdx = attr.indexOf("=");
    const attrName = (eqIdx === -1 ? attr : attr.slice(0, eqIdx))
      .trim()
      .toLowerCase();

    if (attrName === "domain") {
      // Strip Domain=... so the cookie binds to the Vercel proxy host
      continue;
    }
    if (attrName === "samesite" || attrName === "secure") {
      // Normalized below to SameSite=None; Secure
      continue;
    }
    if (attrName === "path") {
      hasPath = true;
    }
    attributes.push(attr);
  }

  if (!hasPath) {
    attributes.push("Path=/");
  }
  attributes.push("SameSite=None");
  attributes.push("Secure");

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
 * rewrites Location redirects, and rewrites Set-Cookie headers.
 */
export function rewriteResponseHeaders(
  upstreamHeaders: Headers,
  currentUpstreamHost: string,
  bodyRewritten: boolean
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

  const setCookies =
    typeof upstreamHeaders.getSetCookie === "function"
      ? upstreamHeaders.getSetCookie()
      : [];

  if (setCookies.length > 0) {
    for (const cookie of setCookies) {
      out.append("set-cookie", rewriteSetCookie(cookie));
    }
  } else {
    const singleCookie = upstreamHeaders.get("set-cookie");
    if (singleCookie) {
      out.append("set-cookie", rewriteSetCookie(singleCookie));
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
 * Rewrites HTML URLs and injects the client-side runtime shim into <head>.
 */
export function rewriteHtmlDocument(html: string): string {
  const rewrittenHtml = rewriteProxyUrlsInText(html);
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
