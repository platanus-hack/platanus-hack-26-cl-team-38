import { after } from "next/server";
import { z } from "zod";
import { runDeliberation } from "@/lib/plans/runner";
import { createPlan, listPlans } from "@/lib/plans/store";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { PLAN_MAX_ROUNDS } from "@/lib/types";
import { authenticate } from "@/lib/users/profile";

// Both need `Authorization: Bearer <device key>`: a plan is read only by its participants.
const denied = () => Response.json({ error: "Falta la clave del dispositivo, o no es la de esa persona" }, { status: 401 });

const PersonId = z.string().min(1).max(80);
const NewPlanSchema = z
  .object({
    personId: PersonId,
    intent: z.string().trim().min(1).max(400),
    memberIds: z.array(PersonId).min(1).max(5),
    // What your agent must keep in mind. Only your agent reads it.
    restrictions: z.array(z.string().trim().min(1).max(240)).max(10).default([]),
  })
  .strict();

// GET /api/plans?personId=… → { plans }
export async function GET(request: Request) {
  const me = await authenticate(supabaseAdmin, new URL(request.url).searchParams.get("personId"), request.headers.get("authorization"));
  if (!me) return denied();
  return Response.json({ plans: await listPlans(supabaseAdmin, me) });
}

// POST /api/plans { personId, intent, memberIds, restrictions? } → { planId }. The agents start
// deliberating once this has answered; the phone follows them with GET /api/plans/<id>.
export async function POST(request: Request) {
  const body = NewPlanSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: z.prettifyError(body.error) }, { status: 400 });
  const { personId, intent, memberIds, restrictions } = body.data;
  if (!(await authenticate(supabaseAdmin, personId, request.headers.get("authorization")))) return denied();

  const planId = `plan-${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
  const created = await createPlan(supabaseAdmin, { id: planId, ownerId: personId, intent, others: memberIds, restrictions, maxRounds: PLAN_MAX_ROUNDS });
  if (!created) return Response.json({ error: "Un plan se arma solo con tus conexiones aceptadas" }, { status: 409 });

  after(() => runDeliberation(planId));
  return Response.json({ planId });
}
