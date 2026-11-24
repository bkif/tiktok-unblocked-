import { NextRequest, NextResponse } from "next/server";
import { pickUserAgent } from "@/lib/tiktok/fetcher";
import { isAllowedTikTokCdnUrl } from "@/lib/tiktok/security";

export const dynamic = "force-dynamic";

const FORWARDED_RESPONSE_HEADERS = [
  "content-type",
  "content-length",
  "content-range",
  "accept-ranges",
  "etag",
  "last-modified",
] as const;

export async function GET(request: NextRequest) {
  const targetUrl = request.nextUrl.searchParams.get("url")?.trim() ?? "";

  if (!targetUrl) {
    return NextResponse.json(
      { ok: false, code: "INVALID_URL", message: "Missing url parameter." },
      { status: 400 }
    );
  }

  if (!isAllowedTikTokCdnUrl(targetUrl)) {
    return NextResponse.json(
      {
        ok: false,
        code: "INVALID_URL",
        message: "Blocked: target hostname is not an allowed TikTok CDN.",
      },
      { status: 403 }
    );
  }

  const upstreamHeaders: Record<string, string> = {
    "User-Agent": pickUserAgent(),
    Referer: "https://www.tiktok.com/",
    Origin: "https://www.tiktok.com",
    Accept: "*/*",
  };

  const rangeHeader = request.headers.get("range");
  if (rangeHeader) {
    upstreamHeaders["Range"] = rangeHeader;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);

  try {
    const upstreamResponse = await fetch(targetUrl, {
      method: "GET",
      headers: upstreamHeaders,
      redirect: "follow",
      signal: controller.signal,
    });
    clearTimeout(timer);

    // Verify final URL after any CDN redirect is also safe
    if (upstreamResponse.url && !isAllowedTikTokCdnUrl(upstreamResponse.url)) {
      return NextResponse.json(
        {
          ok: false,
          code: "INVALID_URL",
          message: "Blocked: upstream redirected outside allowed TikTok CDNs.",
        },
        { status: 403 }
      );
    }

    if (!upstreamResponse.ok && upstreamResponse.status !== 206) {
      return NextResponse.json(
        {
          ok: false,
          code: "UPSTREAM_BLOCKED",
          message: `CDN returned HTTP ${upstreamResponse.status}.`,
        },
        { status: upstreamResponse.status >= 400 ? upstreamResponse.status : 502 }
      );
    }

    const responseHeaders = new Headers();
    for (const headerName of FORWARDED_RESPONSE_HEADERS) {
      const val = upstreamResponse.headers.get(headerName);
      if (val) {
        responseHeaders.set(headerName, val);
      }
    }

    if (!responseHeaders.has("accept-ranges")) {
      responseHeaders.set("accept-ranges", "bytes");
    }

    if (!responseHeaders.has("content-type")) {
      responseHeaders.set("content-type", "application/octet-stream");
    }

    const isDownload = request.nextUrl.searchParams.get("download") === "1";
    if (isDownload) {
      const rawFilename =
        request.nextUrl.searchParams.get("filename") ?? "tiktok_video.mp4";
      const safeFilename = rawFilename.replace(/[^a-zA-Z0-9._-]/g, "_");
      responseHeaders.set(
        "Content-Disposition",
        `attachment; filename="${safeFilename}"`
      );
    }

    responseHeaders.set("Cache-Control", "public, max-age=3600, s-maxage=3600");
    responseHeaders.set("X-Content-Type-Options", "nosniff");

    return new NextResponse(upstreamResponse.body, {
      status: upstreamResponse.status,
      headers: responseHeaders,
    });
  } catch {
    clearTimeout(timer);
    return NextResponse.json(
      {
        ok: false,
        code: "UPSTREAM_BLOCKED",
        message: "Failed to stream media from TikTok CDN.",
      },
      { status: 502 }
    );
  }
}
