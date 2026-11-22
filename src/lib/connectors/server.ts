import "server-only";
import { classifyOnServer } from "@/lib/privacy/server";
import { createInboxStore, type InboxStore } from "./inbox";
import { createConnectorServer } from "./mcp";
import { createOAuth, type OAuth } from "./oauth";
import { receiveProfile } from "./profile";
import { receiveSignals } from "./receive";

// One per process, shared by every onboarding route. On globalThis so a dev reload does not drop
// the inboxes that phones are still waiting on.
const holder = globalThis as typeof globalThis & { connectorInbox?: InboxStore; connectorOAuth?: OAuth };
export const assistantInbox = (holder.connectorInbox ??= createInboxStore());

// Without MCP_OAUTH_SECRET every restart signs with a new key, and connected assistants have to
// authorize again: fine on a laptop, not in production.
function oauthSecret(): string {
  const configured = process.env.MCP_OAUTH_SECRET;
  if (configured && configured.length >= 32) return configured;
  console.warn("[oauth] MCP_OAUTH_SECRET falta o es corto: los conectores se desconectan al reiniciar");
  return crypto.randomUUID() + crypto.randomUUID();
}
export const connectorOAuth = (holder.connectorOAuth ??= createOAuth({ secret: oauthSecret() }));

// Same classifier, and same verdict cache, as onboarding and check-in.
export async function receiveOnServer(token: string | undefined, body: unknown): Promise<Response> {
  const { status, message } = await receiveSignals(token, body, { inbox: assistantInbox, classify: classifyOnServer });
  return new Response(message, { status });
}

export async function receiveProfileOnServer(token: string | undefined, source: unknown, markdown: string): Promise<Response> {
  const { status, message } = await receiveProfile(token, source, markdown, { inbox: assistantInbox, classify: classifyOnServer });
  return new Response(message, { status });
}

export const connectorServer = (owner: string) => createConnectorServer({ inbox: assistantInbox, classify: classifyOnServer }, owner);
