import "server-only";
import { classifyOnServer } from "@/lib/privacy/server";
import { createInboxStore, type InboxStore } from "./inbox";
import { receiveSignals } from "./receive";

// One per process, shared by every onboarding route. On globalThis so a dev reload does not drop
// the inboxes that phones are still waiting on.
const holder = globalThis as typeof globalThis & { assistantInbox?: InboxStore };
export const assistantInbox = (holder.assistantInbox ??= createInboxStore());

// Same classifier, and same verdict cache, as onboarding and check-in.
export async function receiveOnServer(token: string | undefined, body: unknown): Promise<Response> {
  const { status, message } = await receiveSignals(token, body, { inbox: assistantInbox, classify: classifyOnServer });
  return new Response(message, { status });
}
