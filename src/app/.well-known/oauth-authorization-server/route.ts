import { authorizationServerMetadata, CORS, preflight, publicOrigin } from "@/lib/connectors/oauth";

export function GET(request: Request) {
  return Response.json(authorizationServerMetadata(publicOrigin(request)), { headers: CORS });
}

export const OPTIONS = preflight;
