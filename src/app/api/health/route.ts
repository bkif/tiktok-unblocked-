import { NextResponse } from "next/server";
import { pickUserAgent } from "@/lib/tiktok/fetcher";

export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = Date.now();
  let upstreamReachable = false;
  let upstreamStatus = 0;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    const res = await fetch("https://www.tiktok.com/oembed?url=https://www.tiktok.com/@tiktok/video/7106594312292453675", {
      method: "GET",
      headers: {
        "User-Agent": pickUserAgent(),
        Accept: "application/json",
      },
      signal: controller.signal,
    });
    clearTimeout(timer);
    upstreamStatus = res.status;
    upstreamReachable = res.ok || res.status === 400 || res.status === 404;
  } catch {
    upstreamReachable = false;
  }

  const latencyMs = Date.now() - startedAt;

  return NextResponse.json(
    {
      ok: true,
      status: upstreamReachable ? "healthy" : "degraded",
      runtime: process.env.VERCEL ? "vercel" : "node",
      timestamp: new Date().toISOString(),
      upstream: {
        reachable: upstreamReachable,
        status: upstreamStatus,
        latencyMs,
      },
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
