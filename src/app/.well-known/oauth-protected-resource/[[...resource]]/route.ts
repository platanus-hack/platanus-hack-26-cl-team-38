import { CORS, preflight, protectedResourceMetadata, publicOrigin } from "@/lib/connectors/oauth";

// Served both at the root and at /api/mcp: clients try the path of the resource first.
export function GET(request: Request) {
  return Response.json(protectedResourceMetadata(publicOrigin(request)), { headers: CORS });
}

export const OPTIONS = preflight;
