import { NextRequest, NextResponse } from "next/server";
import {
  canonicalizeTikTokUrl,
  extractTargetFromCanonicalUrl,
  fetchTikTokHashtag,
  fetchTikTokProfile,
  fetchTikTokTrending,
  resolveTikTokVideo,
  TikTokFetchError,
} from "@/lib/tiktok/fetcher";
import { classifyQuery } from "@/lib/tiktok/security";
import type { ApiErrorResponse, ApiSuccessResponse, TikTokResolveResult } from "@/types/tiktok";

export const dynamic = "force-dynamic";

function errorResponse(
  error: TikTokFetchError | { code: ApiErrorResponse["code"]; message: string; status: number; retryable: boolean }
): NextResponse<ApiErrorResponse> {
  const status = error instanceof TikTokFetchError ? error.statusCode : error.status;
  return NextResponse.json(
    {
      ok: false,
      code: error.code,
      message: error.message,
      retryable: error.retryable,
    },
    { status }
  );
}

async function handleResolve(rawQuery: string): Promise<NextResponse<ApiSuccessResponse<TikTokResolveResult> | ApiErrorResponse>> {
  const classified = classifyQuery(rawQuery);

  if (classified.kind === "invalid") {
    return errorResponse({
      code: "INVALID_URL",
      message: classified.reason,
      status: 400,
      retryable: false,
    });
  }

  try {
    if (classified.kind === "trending") {
      const { videos, source } = await fetchTikTokTrending();
      return NextResponse.json(
        {
          ok: true,
          data: {
            type: "trending",
            query: "trending",
            videos,
            source,
          },
        },
        {
          headers: {
            "Cache-Control": "s-maxage=180, stale-while-revalidate=300",
          },
        }
      );
    }

    if (classified.kind === "hashtag") {
      const { videos, source } = await fetchTikTokHashtag(classified.tag);
      return NextResponse.json(
        {
          ok: true,
          data: {
            type: "hashtag",
            query: `#${classified.tag}`,
            videos,
            source,
          },
        },
        {
          headers: {
            "Cache-Control": "s-maxage=300, stale-while-revalidate=600",
          },
        }
      );
    }

    if (classified.kind === "username") {
      const { profile, source, warning } = await fetchTikTokProfile(classified.username);
      return NextResponse.json(
        {
          ok: true,
          data: {
            type: "profile",
            query: `@${profile.uniqueId}`,
            profile,
            videos: profile.videos,
            source,
            warning,
          },
        },
        {
          headers: {
            "Cache-Control": "s-maxage=300, stale-while-revalidate=600",
          },
        }
      );
    }

    // URL case: canonicalize first to see if it's a video or profile URL
    const canonicalUrl = await canonicalizeTikTokUrl(classified.url);
    const target = extractTargetFromCanonicalUrl(canonicalUrl);

    if (target.kind === "profile" && target.id) {
      const { profile, source, warning } = await fetchTikTokProfile(target.id);
      return NextResponse.json(
        {
          ok: true,
          data: {
            type: "profile",
            query: `@${profile.uniqueId}`,
            profile,
            videos: profile.videos,
            source,
            warning,
          },
        },
        {
          headers: {
            "Cache-Control": "s-maxage=300, stale-while-revalidate=600",
          },
        }
      );
    }

    const { video, source, warning } = await resolveTikTokVideo(canonicalUrl);
    return NextResponse.json(
      {
        ok: true,
        data: {
          type: "video",
          query: canonicalUrl,
          video,
          videos: [video],
          source,
          warning,
        },
      },
      {
        headers: {
          "Cache-Control": "s-maxage=300, stale-while-revalidate=600",
        },
      }
    );
  } catch (err) {
    if (err instanceof TikTokFetchError) {
      return errorResponse(err);
    }
    return errorResponse({
      code: "INTERNAL_ERROR",
      message: "Unexpected error while resolving TikTok content.",
      status: 500,
      retryable: true,
    });
  }
}

export async function GET(request: NextRequest) {
  const q =
    request.nextUrl.searchParams.get("q") ??
    request.nextUrl.searchParams.get("url") ??
    "";
  return handleResolve(q);
}

export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json();
    if (typeof body !== "object" || body === null) {
      return errorResponse({
        code: "INVALID_URL",
        message: "Request body must be JSON with a query or url field.",
        status: 400,
        retryable: false,
      });
    }
    const record = body as Record<string, unknown>;
    const rawQuery =
      typeof record["q"] === "string"
        ? record["q"]
        : typeof record["url"] === "string"
          ? record["url"]
          : "";
    return handleResolve(rawQuery);
  } catch {
    return errorResponse({
      code: "INVALID_URL",
      message: "Invalid JSON request body.",
      status: 400,
      retryable: false,
    });
  }
}
