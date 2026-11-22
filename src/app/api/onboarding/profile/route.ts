import { PROFILE_MAX_CHARS } from "@/lib/connectors/profile";
import { receiveProfileOnServer } from "@/lib/connectors/server";

// The detailed profile, as the markdown file itself in the body. Called by an assistant that can
// make requests, or by the phone when the person uploads the file their assistant gave them.
export async function POST(request: Request) {
  // UTF-8 takes up to 4 bytes per character; past that the body is not read at all.
  if (Number(request.headers.get("content-length") ?? 0) > PROFILE_MAX_CHARS * 4)
    return new Response("El archivo es muy largo.", { status: 413 });
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return receiveProfileOnServer(token, new URL(request.url).searchParams.get("source"), await request.text());
}
