import { config } from "dotenv";
import seed from "../seed/rooms.json" with { type: "json" };
import { createAdminClient } from "@/lib/supabase/create-admin-client";
import { PublicProjectionSchema, type PublicProjection } from "@/lib/types";
import { runConnectionAction } from "@/lib/users/connections";
import { saveUserInfo } from "@/lib/users/info";
import { saveProfile } from "@/lib/users/profile";
import { embed } from "@/lib/embeddings";
import { saveContext } from "@/lib/plans/store";
import { contextOf, network, propioOf } from "../seed/network";
import { seedUserInfo } from "../seed/user-info";

config({ path: process.env.ENV_FILE ?? ".env.local" });
const db = createAdminClient();

async function run(label: string, query: PromiseLike<{ error: { message: string } | null }>) {
  const { error } = await query;
  if (error) throw new Error(`${label}: ${error.message}`);
}

// Someone in several rooms is one user, with every topic they publish in any of them.
const profiles = new Map<string, PublicProjection>();

for (const room of seed.rooms) {
  // Deleting the room cascades to members, mesas, group nodes and messages, so re-seeding starts clean.
  await run(`borrar ${room.id}`, db.from("rooms").delete().eq("id", room.id));
  await run(`crear ${room.id}`, db.from("rooms").insert({ id: room.id, code: room.code, name: room.name }));
  const members = room.projections.map((raw) => {
    const projection = PublicProjectionSchema.parse(raw);
    const known = profiles.get(projection.personId)?.topics ?? [];
    profiles.set(projection.personId, {
      ...projection,
      topics: [...known, ...projection.topics.filter((t) => !known.some((k) => k.id === t.id))],
    });
    return { room_id: room.id, person_id: projection.personId, display_name: projection.displayName, projection };
  });
  await run(`miembros de ${room.id}`, db.from("room_members").insert(members));
  console.log(`${room.id} (${room.code}): ${members.length} personas`);
}

for (const profile of profiles.values()) await saveProfile(db, profile);
console.log(`${profiles.size} usuarios`);

// The network's connections, accepted by both sides. Closing first makes re-seeding start clean, since
// users and connections outlive the rooms. Relation, closeness and detail have no column yet: they stay
// in seed/network.v2.json (`pending`).
for (const { a, b, origin } of network.connections) {
  await runConnectionAction(db, { personId: a, otherId: b, action: "close" });
  await runConnectionAction(db, { personId: a, otherId: b, action: "propose", origin });
  const accepted = await runConnectionAction(db, { personId: b, otherId: a, action: "accept" });
  if (accepted.status !== 200) throw new Error(`conexión ${a} ↔ ${b}: ${JSON.stringify(accepted)}`);
}
console.log(`${network.connections.length} conexiones aceptadas`);

// What each person's agent reads when planning: the profile ("red") and what is only for their own
// agent ("propio"). Saving replaces what the seed had left there.
let contextLines = 0;
for (const person of network.people) {
  for (const [scope, lines] of Object.entries(contextOf(person)) as [
    "red" | "propio",
    { section: string; text: string }[],
  ][]) {
    const vectors = await embed(lines.map((line) => line.text));
    contextLines += await saveContext(
      db,
      person.personId,
      scope,
      "seed",
      lines.map((line, i) => ({ lineId: `seed-${scope}-${i + 1}`, ...line, embedding: vectors[i] })),
    );
  }
}
// A teammate a case is about (José in the fire brigade one) has only the "propio" part in the seed.
for (const [personId, agentOnly] of Object.entries(network.teamAgentOnly)) {
  const lines = propioOf(agentOnly);
  const vectors = await embed(lines.map((line) => line.text));
  contextLines += await saveContext(
    db,
    personId,
    "propio",
    "seed",
    lines.map((line, i) => ({ lineId: `seed-propio-${i + 1}`, ...line, embedding: vectors[i] })),
  );
}
console.log(`${contextLines} líneas de contexto para los agentes`);

// Last, so everything above loads even where the user_info migration is not applied yet.
const ages = new Map(network.people.map((p) => [p.personId, p.seedOnly.age]));
for (const personId of profiles.keys()) await saveUserInfo(db, personId, seedUserInfo(personId, ages.get(personId)));
console.log(`${profiles.size} usuarios con información de relleno`);
