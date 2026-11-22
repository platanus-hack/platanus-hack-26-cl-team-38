import { listLogs } from "@/lib/mesas/activity";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { authenticate } from "@/lib/users/profile";

// GET /api/logs?personId=…&mesaId=… → { logs }, with `Authorization: Bearer <device key>`: what
// that person's own agent did in the last week. Nobody reads someone else's.
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const me = await authenticate(supabaseAdmin, query.get("personId"), request.headers.get("authorization"));
  if (!me) return Response.json({ error: "Falta la clave del dispositivo, o no es la de esa persona" }, { status: 401 });
  return Response.json({ logs: await listLogs(supabaseAdmin, me, query.get("mesaId") ?? undefined) });
}
