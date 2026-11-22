import { z } from "zod";
import { assistantInbox } from "@/lib/connectors/server";

// Only the ids open() makes: an owner inbox is read with the device key, in ./mine.
const BodySchema = z.object({ inbox: z.string().regex(/^[0-9a-f]{32}$/) }).strict();

// The phone collects what its assistant delivered. POST, not GET, because reading empties the inbox.
export async function POST(request: Request) {
  const body = BodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Se espera { inbox }" }, { status: 400 });

  const signals = assistantInbox.drain(body.data.inbox);
  if (!signals) return Response.json({ error: "El mensaje venció. Copia uno nuevo." }, { status: 404 });
  return Response.json({ signals, profiles: assistantInbox.drainProfiles(body.data.inbox) ?? [] });
}
