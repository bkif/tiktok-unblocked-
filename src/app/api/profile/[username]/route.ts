import { NextRequest, NextResponse } from "next/server";
import { fetchTikTokProfile, TikTokFetchError } from "@/lib/tiktok/fetcher";
import type { ApiErrorResponse, ApiSuccessResponse, TikTokUserProfile } from "@/types/tiktok";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ username: string }>;
}

export async function GET(
  _request: NextRequest,
  context: RouteContext
): Promise<NextResponse<ApiSuccessResponse<{ profile: TikTokUserProfile; source: string; warning?: string }> | ApiErrorResponse>> {
  const { username } = await context.params;
  const decodedUsername = decodeURIComponent(username);

  try {
    const { profile, source, warning } = await fetchTikTokProfile(decodedUsername);
    return NextResponse.json(
      {
        ok: true,
        data: {
          profile,
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
      return NextResponse.json(
        {
          ok: false,
          code: err.code,
          message: err.message,
          retryable: err.retryable,
        },
        { status: err.statusCode }
      );
    }
    return NextResponse.json(
      {
        ok: false,
        code: "INTERNAL_ERROR",
        message: "Failed to load creator profile.",
        retryable: true,
      },
      { status: 500 }
    );
  }
}
