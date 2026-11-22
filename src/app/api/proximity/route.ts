import { z } from "zod";
import { proximityHub } from "@/lib/proximity/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ProximityRequestSchema } from "@/lib/types";
import { authenticate } from "@/lib/users/profile";

// POST /api/proximity: join → { session }; report, radius, heartbeat and leave → { ok }.
// GET /api/proximity?session=… → Server-Sent Events, one ProximityUpdate per message.
// Only someone checked in to the room with their device key can join: the hub itself trusts
// whoever calls it, and a fake position next to real ones is enough to locate people.

const gone = () => Response.json({ error: "La sesión ya no existe" }, { status: 404 });

export async function POST(request: Request) {
  const body = ProximityRequestSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: z.prettifyError(body.error) }, { status: 400 });
  const input = body.data;

  if (input.action === "join") {
    const me = await authenticate(supabaseAdmin, input.personId, request.headers.get("authorization"));
    if (!me) return Response.json({ error: "Falta la clave del dispositivo, o no es la de esa persona" }, { status: 401 });
    const member = await supabaseAdmin.from("room_members").select("display_name").eq("room_id", input.roomId).eq("person_id", me).maybeSingle();
    if (member.error) return Response.json({ error: member.error.message }, { status: 500 });
    if (!member.data) return Response.json({ error: "Primero hay que entrar a la sala" }, { status: 403 });
    const joined = proximityHub.join({ roomId: input.roomId, personId: me, displayName: member.data.display_name.slice(0, 40), radius: input.radius });
    return joined ? Response.json(joined) : Response.json({ error: "La sala está llena" }, { status: 503 });
  }
  if (input.action === "leave") {
    proximityHub.leave(input.session);
    return Response.json({ ok: true });
  }
  const ok =
    input.action === "report"
      ? proximityHub.report(input.session, input.position)
      : input.action === "radius"
        ? proximityHub.setRadius(input.session, input.radius)
        : proximityHub.heartbeat(input.session);
  return ok ? Response.json({ ok }) : gone();
}

export async function GET(request: Request) {
  const session = new URL(request.url).searchParams.get("session") ?? "";
  const encoder = new TextEncoder();
  // Updates can arrive before the stream starts; they wait here instead of being lost.
  const early: Uint8Array[] = [];
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
  const push = (chunk: string) => {
    const bytes = encoder.encode(chunk);
    if (controller) controller.enqueue(bytes);
    else early.push(bytes);
  };
  const stop = proximityHub.listen(session, (update) => push(`data: ${JSON.stringify(update)}\n\n`));
  if (!stop) return gone();

  // A comment line now and then, so proxies don't close a connection that is quiet on purpose.
  const ping = setInterval(() => push(": ping\n\n"), 20_000);
  const end = () => {
    clearInterval(ping);
    stop();
    try {
      controller?.close();
    } catch {
      // Already closed by the client.
    }
  };
  request.signal.addEventListener("abort", end);

  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
      for (const bytes of early.splice(0)) c.enqueue(bytes);
    },
    cancel: end,
  });
  return new Response(stream, {
    headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform", "x-accel-buffering": "no" },
  });
}
