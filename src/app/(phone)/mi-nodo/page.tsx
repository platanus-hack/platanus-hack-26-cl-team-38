import type { Metadata } from "next";
import { PublicProjectionSchema } from "@/lib/types";
import seed from "../../../../seed/rooms.json";
import type { SeedPerson } from "./seed-source";
import { Summary } from "./summary";

export const metadata: Metadata = { title: "Mi Nodo · Minga" };

// Until connectors and the synthesizer exist (fronts A and B), the node starts from a seed person.
// Embeddings stay on the server: the check-in recomputes them.
function seedPeople(): SeedPerson[] {
  const byId = new Map<string, SeedPerson>();
  for (const room of seed.rooms) {
    for (const raw of room.projections) {
      const p = PublicProjectionSchema.parse(raw);
      const person = byId.get(p.personId) ?? {
        personId: p.personId,
        displayName: p.displayName,
        rooms: [],
        topics: p.topics.map(({ id, name, kind, depth, sources }) => ({ id, name, kind, depth, sources })),
      };
      person.rooms.push({ code: room.code, name: room.name });
      byId.set(p.personId, person);
    }
  }
  return [...byId.values()].sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export default function MiNodoPage() {
  return <Summary people={seedPeople()} />;
}
