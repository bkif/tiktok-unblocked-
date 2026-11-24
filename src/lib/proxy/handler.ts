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

type FetchInitWithDuplex = RequestInit & {
  duplex?: "half";
};

const METHODS_WITHOUT_BODY = new Set<string>(["GET", "HEAD"]);
const STATUS_WITHOUT_BODY = new Set<number>([204, 205, 304]);

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
  const search = req.nextUrl.search;
  const upstreamUrl = `https://${targetHost}${normalizedPath}${search}`;

  const upstreamHeaders = buildUpstreamHeaders(req.headers, targetHost);
  const method = req.method.toUpperCase();
  const hasBody = !METHODS_WITHOUT_BODY.has(method) && req.body !== null;

  const fetchInit: FetchInitWithDuplex = {
    method,
    headers: upstreamHeaders,
    redirect: "manual",
    cache: "no-store",
  };

  if (hasBody && req.body) {
    fetchInit.body = req.body;
    fetchInit.duplex = "half";
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

  if (isNoBodyResponse) {
    const headers = rewriteResponseHeaders(upstreamRes.headers, targetHost, false);
    return new Response(null, {
      status: upstreamRes.status,
      statusText: upstreamRes.statusText,
      headers,
    });
  }

  if (isHtmlContentType(contentType)) {
    const rawHtml = await upstreamRes.text();
    const rewrittenHtml = rewriteHtmlDocument(rawHtml);
    const headers = rewriteResponseHeaders(upstreamRes.headers, targetHost, true);
    return new Response(rewrittenHtml, {
      status: upstreamRes.status,
      statusText: upstreamRes.statusText,
      headers,
    });
  }

  if (isRewritableTextContentType(contentType)) {
    const rawText = await upstreamRes.text();
    const rewrittenText = rewriteProxyUrlsInText(rawText);
    const headers = rewriteResponseHeaders(upstreamRes.headers, targetHost, true);
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
    wasCompressed
  );

  return new Response(upstreamRes.body, {
    status: upstreamRes.status,
    statusText: upstreamRes.statusText,
    headers,
  });
}
