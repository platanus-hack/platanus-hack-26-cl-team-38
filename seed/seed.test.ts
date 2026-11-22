import { describe, expect, it } from "vitest";
import { EMBEDDING_DIM, EMBEDDING_MODEL } from "@/lib/embeddings";
import { PublicProjectionSchema } from "@/lib/types";
import { SEED_EXPECTATIONS, SEED_ROOMS } from "./people";
import seed from "./rooms.json";

describe("seed/rooms.json", () => {
  it("was built from the current people.ts with the current model", () => {
    expect(seed.embeddingModel).toBe(EMBEDDING_MODEL);
    const built = seed.rooms.map((r) => ({
      id: r.id,
      topics: r.projections.map((p) => p.topics.map((t) => [t.name, t.kind, t.depth])),
    }));
    const source = SEED_ROOMS.map((r) => ({
      id: r.id,
      topics: r.people.map((p) => p.topics.map(([n, k, d]) => [n, k, d])),
    }));
    expect(built).toEqual(source);
  });

  it.each(seed.rooms.flatMap((r) => r.projections.map((p) => [p.personId, p] as const)))(
    "%s is a valid public projection with embeddings",
    (_id, projection) => {
      const parsed = PublicProjectionSchema.parse(projection);
      for (const topic of parsed.topics) expect(topic.embedding).toHaveLength(EMBEDDING_DIM);
    },
  );

  it("has unique topic ids across each room", () => {
    for (const room of seed.rooms) {
      const ids = room.projections.flatMap((p) => p.topics.map((t) => t.id));
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("respects the depth caps of the synthesizer", () => {
    for (const topic of seed.rooms.flatMap((r) => r.projections.flatMap((p) => p.topics))) {
      if (topic.kind === "le_gusta") expect(topic.depth, topic.id).toBeLessThanOrEqual(2);
      if (topic.depth === 3) expect(["sabe", "hace", "es", "ofrece"], topic.id).toContain(topic.kind);
    }
  });

  it("has 15 to 20 people in the main room and an expectations entry for every room", () => {
    const main = seed.rooms.find((r) => r.id === "seed-mut")!;
    expect(main.projections.length).toBeGreaterThanOrEqual(15);
    expect(main.projections.length).toBeLessThanOrEqual(20);
    expect(Object.keys(SEED_EXPECTATIONS).sort()).toEqual(seed.rooms.map((r) => r.id).sort());
  });

  it("only references people that exist", () => {
    const ids = new Set(seed.rooms.flatMap((r) => r.projections.map((p) => p.personId)));
    const { mustIncludeMesa, noObviousMatch } = SEED_EXPECTATIONS["seed-mut"];
    for (const id of [...mustIncludeMesa, noObviousMatch]) expect(ids).toContain(id);
  });
});
