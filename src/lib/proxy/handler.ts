import type { NextRequest } from "next/server";
import { isAllowedHost } from "./config";
import {
  buildUpstreamHeaders,
  isHtmlContentType,
  isRewritableTextContentType,
  rewriteHtmlDocument,
  rewriteProxyUrlsInText,
  rewriteResponseHeaders,
} from "./rewriter";

const METHODS_WITHOUT_BODY = new Set<string>(["GET", "HEAD"]);
const STATUS_WITHOUT_BODY = new Set<number>([204, 205, 304]);

function getRawSearch(req: NextRequest): string {
  const qIdx = req.url.indexOf("?");
  if (qIdx !== -1) {
    return req.url.slice(qIdx);
  }
  return req.nextUrl.search;
}

function shouldForceNoStore(targetPath: string): boolean {
  return (
    targetPath.startsWith("/passport/") ||
    targetPath.startsWith("/api/")
  );
}

/**
 * Executes a transparent reverse-proxy request to an allowlisted TikTok/ByteDance host.
 */
export async function proxyRequest(
  req: NextRequest,
  targetHost: string,
  targetPath: string
): Promise<Response> {
  if (!isAllowedHost(targetHost)) {
    return Response.json(
      { error: "Forbidden: target host is not in the TikTok/ByteDance allowlist." },
      { status: 403 }
    );
  }

  const normalizedPath = targetPath.startsWith("/") ? targetPath : `/${targetPath}`;
  const rawSearch = getRawSearch(req);
  const upstreamUrl = `https://${targetHost}${normalizedPath}${rawSearch}`;

  const upstreamHeaders = buildUpstreamHeaders(
    req.headers,
    targetHost,
    normalizedPath
  );
  const method = req.method.toUpperCase();

  const fetchInit: RequestInit = {
    method,
    headers: upstreamHeaders,
    redirect: "manual",
    cache: "no-store",
  };

  if (!METHODS_WITHOUT_BODY.has(method)) {
    const rawBody = await req.arrayBuffer();
    if (rawBody.byteLength > 0) {
      fetchInit.body = rawBody;
    }
  }

  let upstreamRes: Response;
  try {
    upstreamRes = await fetch(upstreamUrl, fetchInit);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown upstream error";
    return Response.json(
      {
        error: "Bad Gateway: failed to reach upstream TikTok host.",
        host: targetHost,
        detail: message,
      },
      { status: 502 }
    );
  }

  const contentType = upstreamRes.headers.get("content-type") ?? "";
  const isNoBodyResponse =
    method === "HEAD" || STATUS_WITHOUT_BODY.has(upstreamRes.status);
  const headerOptions = {
    forceNoStore: shouldForceNoStore(normalizedPath),
  };

  if (isNoBodyResponse) {
    const headers = rewriteResponseHeaders(
      upstreamRes.headers,
      targetHost,
      false,
      headerOptions
    );
    return new Response(null, {
      status: upstreamRes.status,
      statusText: upstreamRes.statusText,
      headers,
    });
  }

  if (isHtmlContentType(contentType)) {
    const rawHtml = await upstreamRes.text();
    const rewrittenHtml = rewriteHtmlDocument(rawHtml);
    const headers = rewriteResponseHeaders(
      upstreamRes.headers,
      targetHost,
      true,
      headerOptions
    );
    return new Response(rewrittenHtml, {
      status: upstreamRes.status,
      statusText: upstreamRes.statusText,
      headers,
    });
  }

  if (isRewritableTextContentType(contentType)) {
    const rawText = await upstreamRes.text();
    const rewrittenText = rewriteProxyUrlsInText(rawText);
    const headers = rewriteResponseHeaders(
      upstreamRes.headers,
      targetHost,
      true,
      headerOptions
    );
    return new Response(rewrittenText, {
      status: upstreamRes.status,
      statusText: upstreamRes.statusText,
      headers,
    });
  }

  const wasCompressed = upstreamRes.headers.has("content-encoding");
  const headers = rewriteResponseHeaders(
    upstreamRes.headers,
    targetHost,
    wasCompressed,
    headerOptions
  );

  return new Response(upstreamRes.body, {
    status: upstreamRes.status,
    statusText: upstreamRes.statusText,
    headers,
  });
}
