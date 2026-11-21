import { z } from "zod";
import { assistantInbox } from "@/lib/connectors/server";

const BodySchema = z.object({ inbox: z.string().min(1).max(64) }).strict();

// The phone collects what its assistant delivered. POST, not GET, because reading empties the inbox.
export async function POST(request: Request) {
  const body = BodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Se espera { inbox }" }, { status: 400 });

  const signals = assistantInbox.drain(body.data.inbox);
  if (!signals) return Response.json({ error: "El mensaje venció. Copia uno nuevo." }, { status: 404 });
  return Response.json({ signals });
}
