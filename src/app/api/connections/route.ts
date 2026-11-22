import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ConnectionRequestSchema, listConnections, runConnectionAction } from "@/lib/users/connections";
import { authenticate } from "@/lib/users/profile";

// Both need `Authorization: Bearer <device key>`: a connection is read and changed only by its two parties.
const denied = () => Response.json({ error: "Falta la clave del dispositivo, o no es la de esa persona" }, { status: 401 });

// GET /api/connections?personId=… → { connections }
export async function GET(request: Request) {
  const me = await authenticate(supabaseAdmin, new URL(request.url).searchParams.get("personId"), request.headers.get("authorization"));
  if (!me) return denied();
  return Response.json({ connections: await listConnections(supabaseAdmin, me) });
}

// POST /api/connections { personId, otherId, action: "propose" | "accept" | "close", origin? } → { connection }
export async function POST(request: Request) {
  const body = ConnectionRequestSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: z.prettifyError(body.error) }, { status: 400 });
  if (!(await authenticate(supabaseAdmin, body.data.personId, request.headers.get("authorization")))) return denied();
  const { status, ...result } = await runConnectionAction(supabaseAdmin, body.data);
  return Response.json(result, { status });
}
