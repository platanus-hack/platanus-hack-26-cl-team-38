import { writeFileSync } from "node:fs";
import { SEED_ROOMS } from "../seed/people";
import { cosine, embed, EMBEDDING_MODEL } from "@/lib/embeddings";
import { PublicProjectionSchema, type PublicProjection } from "@/lib/types";

const THEME_THRESHOLD = 0.6;

function slugify(name: string): string {
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

const names = [...new Set(SEED_ROOMS.flatMap((r) => r.people.flatMap((p) => p.topics.map(([name]) => name))))].sort();
const vectors = await embed(names);
const embeddingOf = new Map(names.map((n, i) => [n, vectors[i].map((v) => Number(v.toFixed(5)))]));

const rooms = SEED_ROOMS.map((room) => {
  const projections: PublicProjection[] = room.people.map((person) => {
    const personId = `seed-${person.slug}`;
    return PublicProjectionSchema.parse({
      personId,
      displayName: person.displayName,
      topics: person.topics.map(([name, kind, depth, sources]) => ({
        id: `${personId}.${slugify(name)}`,
        name,
        kind,
        depth,
        sources,
        embedding: embeddingOf.get(name),
      })),
    });
  });
  return { id: room.id, code: room.code, name: room.name, projections };
});

writeFileSync(
  new URL("../seed/rooms.json", import.meta.url),
  JSON.stringify({ embeddingModel: EMBEDDING_MODEL, rooms }, null, 1) + "\n",
);

// Near-duplicate names across people end up in the same theme; print them so seed edits are deliberate.
let controlLeaks = 0;
for (const room of rooms) {
  const roomNames = [...new Set(room.projections.flatMap((p) => p.topics.map((t) => t.name)))].sort();
  console.log(`\n${room.id}: ${room.projections.length} personas, ${roomNames.length} tópicos distintos`);
  for (let i = 0; i < roomNames.length; i++) {
    for (let j = i + 1; j < roomNames.length; j++) {
      const sim = cosine(embeddingOf.get(roomNames[i])!, embeddingOf.get(roomNames[j])!);
      if (sim < THEME_THRESHOLD) continue;
      console.log(`  ${sim.toFixed(2)}  ${roomNames[i]} ~ ${roomNames[j]}`);
      if (room.id === "seed-control") controlLeaks++;
    }
  }
}

if (controlLeaks > 0) {
  console.error(`\nLa sala de control tiene ${controlLeaks} pares sobre ${THEME_THRESHOLD}: cambiar sus tópicos.`);
  process.exit(1);
}
console.log("\nseed/rooms.json escrito.");
