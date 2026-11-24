import type { NextRequest } from "next/server";
import { proxyRequest } from "@/lib/proxy/handler";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface ProxyRouteContext {
  params: Promise<{
    host: string;
    path?: string[];
  }>;
}

async function handle(req: NextRequest, context: ProxyRouteContext): Promise<Response> {
  const { host, path } = await context.params;
  const decodedHost = decodeURIComponent(host);
  const rawPathname = req.nextUrl.pathname;

  const internalPrefix = `/internal/proxy/${host}`;
  const publicPrefix = `/_proxy/${host}`;

  let targetPath: string;
  if (rawPathname.startsWith(internalPrefix)) {
    targetPath = rawPathname.slice(internalPrefix.length) || "/";
  } else if (rawPathname.startsWith(publicPrefix)) {
    targetPath = rawPathname.slice(publicPrefix.length) || "/";
  } else {
    targetPath = `/${(path ?? []).join("/")}`;
  }

  return proxyRequest(req, decodedHost, targetPath);
}

export async function GET(req: NextRequest, context: ProxyRouteContext): Promise<Response> {
  return handle(req, context);
}

export async function POST(req: NextRequest, context: ProxyRouteContext): Promise<Response> {
  return handle(req, context);
}

export async function PUT(req: NextRequest, context: ProxyRouteContext): Promise<Response> {
  return handle(req, context);
}

export async function PATCH(req: NextRequest, context: ProxyRouteContext): Promise<Response> {
  return handle(req, context);
}

export async function DELETE(req: NextRequest, context: ProxyRouteContext): Promise<Response> {
  return handle(req, context);
}

export async function OPTIONS(req: NextRequest, context: ProxyRouteContext): Promise<Response> {
  return handle(req, context);
}

export async function HEAD(req: NextRequest, context: ProxyRouteContext): Promise<Response> {
  return handle(req, context);
}
