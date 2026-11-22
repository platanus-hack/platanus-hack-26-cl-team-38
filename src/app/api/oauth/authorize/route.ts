import { connectorOAuth } from "@/lib/connectors/server";

// The authorization page posts here the request it was opened with plus the code from the phone.
export async function POST(request: Request) {
  const result = connectorOAuth.authorize(await request.json().catch(() => null));
  return "redirect" in result ? Response.json({ redirect: result.redirect }) : Response.json({ error: result.error }, { status: result.status });
}
