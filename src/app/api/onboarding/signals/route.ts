import { receiveOnServer } from "@/lib/connectors/server";

// Called by the person's assistant when it can make requests (Claude Code, for instance).
export async function POST(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return receiveOnServer(token, await request.json().catch(() => null));
}
