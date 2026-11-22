import { planGraph } from "@/lib/plans/store";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { authenticate } from "@/lib/users/profile";

// GET /api/plans/graph?personId=… → { connections }: who you can make a plan with, and how many
// contacts of their own each one's agent can draw on.
export async function GET(request: Request) {
  const me = await authenticate(
    supabaseAdmin,
    new URL(request.url).searchParams.get("personId"),
    request.headers.get("authorization"),
  );
  if (!me)
    return Response.json({ error: "Falta la clave del dispositivo, o no es la de esa persona" }, { status: 401 });
  return Response.json(await planGraph(supabaseAdmin, me));
}
