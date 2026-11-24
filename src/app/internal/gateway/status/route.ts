import { getGatewayStatusResponse } from "@/lib/proxy/status";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return getGatewayStatusResponse();
}
