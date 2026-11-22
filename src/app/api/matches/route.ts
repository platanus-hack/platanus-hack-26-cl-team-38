import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { authenticate, matchUsers } from "@/lib/users/profile";

const denied = () => Response.json({ error: "Falta la clave del dispositivo, o no es la de esa persona" }, { status: 401 });

const BodySchema = z.object({ personId: z.string().min(1).max(80), otherIds: z.array(z.string().min(1).max(80)).min(1).max(100) }).strict();

// POST /api/matches { personId, otherIds } → { matches }: the crossing with the people the phone
// has in front of it, computed now. Only public topics are compared, so it reveals nothing the
// room does not show.
export async function POST(request: Request) {
  const body = BodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: z.prettifyError(body.error) }, { status: 400 });
  const me = await authenticate(supabaseAdmin, body.data.personId, request.headers.get("authorization"));
  if (!me) return denied();
  return Response.json({ matches: await matchUsers(supabaseAdmin, me, body.data.otherIds) });
}
