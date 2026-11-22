import { after } from "next/server";
import { isDeliberatingHere, runDeliberation } from "@/lib/plans/runner";
import { loadPlan, neighbourhood } from "@/lib/plans/store";
import { viewPlan } from "@/lib/plans/view";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { authenticate } from "@/lib/users/profile";

// GET /api/plans/<id>?personId=… → { plan }, with `Authorization: Bearer <device key>`: the plan
// as that participant may read it. The phone polls this while the agents deliberate.
export async function GET(request: Request, ctx: RouteContext<"/api/plans/[id]">) {
  const { id } = await ctx.params;
  const me = await authenticate(supabaseAdmin, new URL(request.url).searchParams.get("personId"), request.headers.get("authorization"));
  if (!me) return Response.json({ error: "Falta la clave del dispositivo, o no es la de esa persona" }, { status: 401 });

  const plan = await loadPlan(supabaseAdmin, id);
  const contacts = plan ? await neighbourhood(supabaseAdmin, id, me) : [];
  const view = plan && viewPlan(plan, me, new Map(contacts.map((c) => [c.contactId, c.contactName])));
  if (!view) return Response.json({ error: "No existe ese plan, o no participas en él" }, { status: 404 });

  // A deliberation whose process died is taken again by whoever is watching it.
  if (view.status === "deliberando" && !isDeliberatingHere(id)) after(() => runDeliberation(id));
  return Response.json({ plan: view });
}
