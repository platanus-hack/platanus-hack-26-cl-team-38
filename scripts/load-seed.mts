import { config } from "dotenv";
import seed from "../seed/rooms.json" with { type: "json" };
import { createAdminClient } from "@/lib/supabase/create-admin-client";
import { PublicProjectionSchema } from "@/lib/types";

config({ path: process.env.ENV_FILE ?? ".env.local" });
const db = createAdminClient();

async function run(label: string, query: PromiseLike<{ error: { message: string } | null }>) {
  const { error } = await query;
  if (error) throw new Error(`${label}: ${error.message}`);
}

for (const room of seed.rooms) {
  // Deleting the room cascades to members, mesas, group nodes and messages, so re-seeding starts clean.
  await run(`borrar ${room.id}`, db.from("rooms").delete().eq("id", room.id));
  await run(`crear ${room.id}`, db.from("rooms").insert({ id: room.id, code: room.code, name: room.name }));
  const members = room.projections.map((raw) => {
    const projection = PublicProjectionSchema.parse(raw);
    return { room_id: room.id, person_id: projection.personId, display_name: projection.displayName, projection };
  });
  await run(`miembros de ${room.id}`, db.from("room_members").insert(members));
  console.log(`${room.id} (${room.code}): ${members.length} personas`);
}
