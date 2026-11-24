import type { NextRequest } from "next/server";
import { getPrimaryUpstreamHost } from "@/lib/proxy/config";
import { proxyRequest } from "@/lib/proxy/handler";
import { getGatewayStatusResponse } from "@/lib/proxy/status";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function extractProxyTarget(
  pathname: string,
  prefix: string
): { host: string; targetPath: string } | null {
  if (!pathname.startsWith(prefix)) {
    return null;
  }
  const rest = pathname.slice(prefix.length);
  if (!rest) {
    return null;
  }
  const slashIdx = rest.indexOf("/");
  if (slashIdx === -1) {
    return {
      host: decodeURIComponent(rest),
      targetPath: "/",
    };
  }
  return {
    host: decodeURIComponent(rest.slice(0, slashIdx)),
    targetPath: rest.slice(slashIdx) || "/",
  };
}

async function handle(req: NextRequest): Promise<Response> {
  const pathname = req.nextUrl.pathname || "/";

  if (pathname === "/_gateway/status" || pathname === "/internal/gateway/status") {
    return getGatewayStatusResponse();
  }

  const proxyTarget =
    extractProxyTarget(pathname, "/_proxy/") ??
    extractProxyTarget(pathname, "/internal/proxy/");

  if (proxyTarget) {
    return proxyRequest(req, proxyTarget.host, proxyTarget.targetPath);
  }

  const targetHost = getPrimaryUpstreamHost(req.headers.get("user-agent"));
  return proxyRequest(req, targetHost, pathname);
}

export async function GET(req: NextRequest): Promise<Response> {
  return handle(req);
}

export async function POST(req: NextRequest): Promise<Response> {
  return handle(req);
}

export async function PUT(req: NextRequest): Promise<Response> {
  return handle(req);
}

export async function PATCH(req: NextRequest): Promise<Response> {
  return handle(req);
}

export async function DELETE(req: NextRequest): Promise<Response> {
  return handle(req);
}

export async function OPTIONS(req: NextRequest): Promise<Response> {
  return handle(req);
}

export async function HEAD(req: NextRequest): Promise<Response> {
  return handle(req);
}
