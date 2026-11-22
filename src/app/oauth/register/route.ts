import { oauthJson, preflight } from "@/lib/connectors/oauth";
import { connectorOAuth } from "@/lib/connectors/server";

export async function POST(request: Request) {
  return oauthJson(connectorOAuth.register(await request.json().catch(() => null)));
}

export const OPTIONS = preflight;
