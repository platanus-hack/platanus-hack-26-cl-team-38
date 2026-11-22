import { basicCredentials, oauthJson, preflight } from "@/lib/connectors/oauth";
import { connectorOAuth } from "@/lib/connectors/server";

// The spec says form-encoded; JSON is accepted too because some clients send it.
async function readForm(request: Request): Promise<URLSearchParams> {
  if (request.headers.get("content-type")?.includes("application/json")) {
    const body: unknown = await request.json().catch(() => ({}));
    const entries =
      body && typeof body === "object"
        ? Object.entries(body).filter((e): e is [string, string] => typeof e[1] === "string")
        : [];
    return new URLSearchParams(entries);
  }
  return new URLSearchParams(await request.text());
}

export async function POST(request: Request) {
  return oauthJson(
    connectorOAuth.token(await readForm(request), basicCredentials(request.headers.get("authorization"))),
  );
}

export const OPTIONS = preflight;
