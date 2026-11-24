import {
  ALLOWED_DOMAIN_SUFFIXES,
  PRIMARY_DESKTOP_HOST,
  PRIMARY_MOBILE_HOST,
  VERCEL_PAYLOAD_LIMIT_BYTES,
} from "./config";

interface UpstreamProbeResult {
  reachable: boolean;
  status: number | null;
  latencyMs: number;
  error?: string;
}

async function probeUpstream(): Promise<UpstreamProbeResult> {
  const startedAt = Date.now();
  try {
    const res = await fetch(`https://${PRIMARY_DESKTOP_HOST}/`, {
      method: "HEAD",
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    return {
      reachable: res.status > 0 && res.status < 500,
      status: res.status,
      latencyMs: Date.now() - startedAt,
    };
  } catch (err: unknown) {
    return {
      reachable: false,
      status: null,
      latencyMs: Date.now() - startedAt,
      error: err instanceof Error ? err.message : "Probe failed",
    };
  }
}

export async function getGatewayStatusResponse(): Promise<Response> {
  const upstream = await probeUpstream();

  return Response.json(
    {
      status: "ok",
      service: "tiktok-web-reverse-proxy-gateway",
      timestamp: new Date().toISOString(),
      upstream,
      config: {
        primaryDesktopHost: PRIMARY_DESKTOP_HOST,
        primaryMobileHost: PRIMARY_MOBILE_HOST,
        allowedDomainSuffixes: ALLOWED_DOMAIN_SUFFIXES,
        vercelPayloadLimitBytes: VERCEL_PAYLOAD_LIMIT_BYTES,
      },
    },
    {
      status: 200,
      headers: {
        "cache-control": "no-store",
      },
    }
  );
}
