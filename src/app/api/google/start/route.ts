import { googleAuthUrl, googleConfig } from "@/lib/connectors/google";
import { ownerOf, publicOrigin } from "@/lib/connectors/oauth";
import { googleFlow } from "@/lib/connectors/server";
import { bearerKey } from "@/lib/users/profile";

// The phone asks where to send the person: Google's consent screen for the per-file Drive
// permission. The `state` ties Google's answer to this phone, so the signals land in its inbox.
export async function POST(request: Request) {
  const key = bearerKey(request.headers.get("authorization"));
  if (!key) return Response.json({ error: "Falta la clave del teléfono." }, { status: 401 });
  const config = googleConfig();
  if (!config) return Response.json({ error: "Google no está configurado en este servidor." }, { status: 503 });
  return Response.json({
    url: googleAuthUrl(config.clientId, `${publicOrigin(request)}/api/google/callback`, googleFlow.put(ownerOf(key))),
  });
}
