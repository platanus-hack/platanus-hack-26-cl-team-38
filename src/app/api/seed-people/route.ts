import { readFile } from "node:fs/promises";
import path from "node:path";
import type { PublicProjection } from "@/lib/types";

// Demo mode only (no Supabase configured): everyone in the seed (seed/rooms.json), once, without
// embeddings. The phone turns them into people you crossed paths with.

type SeedRooms = { rooms: { id: string; projections: PublicProjection[] }[] };

let people: Promise<PublicProjection[]> | undefined;

async function load(): Promise<PublicProjection[]> {
  const raw = JSON.parse(await readFile(path.join(process.cwd(), "seed/rooms.json"), "utf8")) as SeedRooms;
  const byId = new Map<string, PublicProjection>();
  for (const room of raw.rooms)
    for (const p of room.projections)
      byId.set(p.personId, {
        personId: p.personId,
        displayName: p.displayName,
        topics: p.topics.map((t) => ({ id: t.id, name: t.name, kind: t.kind, depth: t.depth, sources: t.sources })),
        ...(p.profile && { profile: p.profile }),
      });
  return [...byId.values()];
}

export async function GET() {
  people ??= load();
  return Response.json({ people: await people });
}
