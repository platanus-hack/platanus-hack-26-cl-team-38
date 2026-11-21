import { embed } from "@/lib/embeddings";
import { admitCheckIn } from "@/lib/privacy/checkin";
import { classifyOnServer } from "@/lib/privacy/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const admitted = await admitCheckIn(await request.json().catch(() => null), { classify: classifyOnServer, embed });
  if (!admitted.ok) return Response.json({ error: admitted.error }, { status: 400 });
  const { projection, rejected, roomCode } = admitted;

  const room = await supabaseAdmin.from("rooms").select("id").eq("code", roomCode).maybeSingle();
  if (room.error) return Response.json({ error: room.error.message }, { status: 500 });
  if (!room.data) return Response.json({ error: "No existe una sala con ese código" }, { status: 404 });

  const write = await supabaseAdmin
    .from("room_members")
    .upsert({ room_id: room.data.id, person_id: projection.personId, display_name: projection.displayName, projection });
  if (write.error) return Response.json({ error: write.error.message }, { status: 500 });

  return Response.json({ roomId: room.data.id, accepted: projection.topics.map((t) => t.id), rejected });
}
