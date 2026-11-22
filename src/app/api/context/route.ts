import { z } from "zod";
import { AssistantSourceSchema } from "@/lib/connectors/assistant";
import { PROFILE_MAX_CHARS, PROFILE_MAX_LINES } from "@/lib/connectors/profile";
import { embed } from "@/lib/embeddings";
import { storeProfile } from "@/lib/plans/profile-context";
import { classifyOnServer } from "@/lib/privacy/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { authenticate } from "@/lib/users/profile";

const BodySchema = z
  .object({
    personId: z.string().min(1).max(80),
    source: AssistantSourceSchema,
    markdown: z.string().max(PROFILE_MAX_CHARS),
  })
  .strict();

// POST /api/context { personId, source, markdown } → { kept, held, unreviewed }, with
// `Authorization: Bearer <device key>`. Stores the detailed profile an assistant wrote where the
// person's agent can read it, and where the agents of their connections can when planning. It
// goes through the privacy filter again here: the server does not trust the phone. Sending it
// again replaces what that assistant had left; an empty one removes it.
export async function POST(request: Request) {
  const body = BodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: z.prettifyError(body.error) }, { status: 400 });
  const { personId, source, markdown } = body.data;
  if (markdown.split("\n").length > PROFILE_MAX_LINES * 2)
    return Response.json({ error: "El perfil es muy largo" }, { status: 400 });
  if (!(await authenticate(supabaseAdmin, personId, request.headers.get("authorization")))) {
    return Response.json({ error: "Falta la clave del dispositivo, o no es la de esa persona" }, { status: 401 });
  }
  return Response.json(
    await storeProfile(supabaseAdmin, personId, source, markdown, { classify: classifyOnServer, embed }),
  );
}
