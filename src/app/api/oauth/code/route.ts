import { ownerOf } from "@/lib/connectors/oauth";
import { connectorOAuth } from "@/lib/connectors/server";
import { bearerKey } from "@/lib/users/profile";

// The phone asks for a code to type on the authorization page, proving which phone it is with its
// device key. Whatever the connector delivers afterwards lands in this phone's inbox.
export async function POST(request: Request) {
  const key = bearerKey(request.headers.get("authorization"));
  if (!key) return Response.json({ error: "Falta la clave del teléfono." }, { status: 401 });
  return Response.json(connectorOAuth.phoneCode(ownerOf(key)));
}
