import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export const config = {
  matcher: ["/_proxy/:path*", "/_gateway/:path*"],
};

/**
 * Next.js App Router treats underscore-prefixed folders (`_proxy`, `_gateway`)
 * as private non-routable folders. This middleware maps public `/_proxy/*` and
 * `/_gateway/*` paths to `/internal/proxy/*` and `/internal/gateway/*`.
 */
export function middleware(req: NextRequest): NextResponse {
  const url = req.nextUrl.clone();

  if (url.pathname.startsWith("/_proxy/")) {
    url.pathname = `/internal/proxy/${url.pathname.slice("/_proxy/".length)}`;
    return NextResponse.rewrite(url);
  }

  if (url.pathname === "/_gateway" || url.pathname.startsWith("/_gateway/")) {
    url.pathname = `/internal/gateway${url.pathname.slice("/_gateway".length)}`;
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}
