import { ownerOf } from "@/lib/connectors/oauth";
import { assistantInbox } from "@/lib/connectors/server";
import { bearerKey } from "@/lib/users/profile";

// What a connected assistant delivered to this phone. POST, not GET, because reading empties it.
export async function POST(request: Request) {
  const key = bearerKey(request.headers.get("authorization"));
  if (!key) return Response.json({ error: "Falta la clave del teléfono." }, { status: 401 });
  return Response.json(assistantInbox.drainOwner(ownerOf(key)));
}
