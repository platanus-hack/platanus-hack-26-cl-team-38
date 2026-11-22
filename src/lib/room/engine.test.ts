import { describe, expect, it } from "vitest";
import { MesaSchema, PublicProjectionSchema, ThemeSchema, type PublicProjection } from "@/lib/types";
import { SEED_EXPECTATIONS } from "../../../seed/people";
import seed from "../../../seed/rooms.json";
import { computeRoom } from "./engine";
import { buildIndex, MESA_MAX, MESA_MIN, MESAS_PER_PERSON } from "./model";
import { rolesOf } from "./roles";
import { scoreMesa } from "./score";
import { buildThemes } from "./themes";

const room = (id: string) => {
  const r = seed.rooms.find((x) => x.id === id)!;
  return { id: r.id, projections: r.projections.map((p) => PublicProjectionSchema.parse(p)) };
};

// Deterministic shuffle (mulberry32), so a failure reproduces.
function shuffle<T>(items: T[], seedValue: number): T[] {
  let s = seedValue;
  const rand = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const peopleOf = (mesa: { members: { personId: string }[] }) => mesa.members.map((m) => m.personId);

describe.each(seed.rooms.map((r) => r.id))("computeRoom(%s): invariants", (roomId) => {
  const { projections } = room(roomId);
  const result = computeRoom(roomId, projections);

  it("returns valid themes and mesas", () => {
    for (const theme of result.themes) ThemeSchema.parse(theme);
    for (const mesa of result.mesas) expect(MesaSchema.parse(mesa).roomId).toBe(roomId);
  });

  it("gives the same mesas for the same input in another order", () => {
    for (const s of [1, 2, 3]) {
      const shuffled = shuffle(projections, s).map((p) => ({ ...p, topics: shuffle(p.topics, s + 10) }));
      expect(computeRoom(roomId, shuffled)).toEqual(result);
    }
  });

  it("seats 3 to 5 different people per mesa, and nobody in more than 2", () => {
    const count = new Map<string, number>();
    for (const mesa of result.mesas) {
      const people = peopleOf(mesa);
      expect(new Set(people).size).toBe(people.length);
      expect(people.length).toBeGreaterThanOrEqual(MESA_MIN);
      expect(people.length).toBeLessThanOrEqual(MESA_MAX);
      for (const p of people) count.set(p, (count.get(p) ?? 0) + 1);
    }
    for (const n of count.values()) expect(n).toBeLessThanOrEqual(MESAS_PER_PERSON);
  });

  it("leaves nobody without a mesa while one is open", () => {
    const seated = new Set(result.mesas.flatMap(peopleOf));
    const index = buildIndex(projections);
    const alone = projections.filter((p) => !seated.has(p.personId) && index.entriesOf.get(p.personId)?.length);
    if (alone.length > 0) for (const mesa of result.mesas) expect(mesa.members.length).toBe(MESA_MAX);
  });

  it("seats each member with a role their topic actually gives, in its theme", () => {
    const topics = new Map(projections.flatMap((p) => p.topics.map((t) => [t.id, { ...t, personId: p.personId }])));
    const themeOf = new Map(result.themes.flatMap((t) => t.topicIds.map((id) => [id, t.id])));
    for (const m of result.mesas.flatMap((x) => x.members)) {
      const topic = topics.get(m.topicId)!;
      expect(topic.personId).toBe(m.personId);
      expect(rolesOf(topic)).toContain(m.role);
      expect(themeOf.get(m.topicId)).toBe(m.themeId);
    }
  });
});

describe("computeRoom against SEED_EXPECTATIONS", () => {
  const mut = computeRoom("seed-mut", room("seed-mut").projections);
  const expected = SEED_EXPECTATIONS["seed-mut"];
  const themeNamed = (name: string) => mut.themes.find((t) => t.name === name)!;

  it("seats Ana, Bruno and Carla together", () => {
    expect(mut.mesas.some((m) => expected.mustIncludeMesa.every((p) => peopleOf(m).includes(p)))).toBe(true);
  });

  it("gives no complement mesa to a theme with only experts", () => {
    const theme = themeNamed(expected.noComplementMesaForTheme);
    for (const mesa of mut.mesas.filter((m) => m.anchorThemeId === theme.id)) {
      expect(mesa.members.some((m) => m.role === "busca")).toBe(false);
    }
  });

  it("gives an affinity mesa to a theme people only share", () => {
    const theme = themeNamed(expected.affinityTheme);
    const mesa = mut.mesas.find((m) => m.anchorThemeId === theme.id);
    expect(mesa?.members.every((m) => m.role === "comparte")).toBe(true);
  });

  it("finds a seat for the person with no obvious match", () => {
    expect(mut.mesas.some((m) => peopleOf(m).includes(expected.noObviousMatch))).toBe(true);
  });

  it("seats the same people at mesas on different themes (decision 21-11)", () => {
    const together = mut.mesas.filter((m) => ["seed-ana", "seed-carla"].every((p) => peopleOf(m).includes(p)));
    expect(new Set(together.map((m) => m.anchorThemeId)).size).toBeGreaterThanOrEqual(2);
  });

  it("gives 0 mesas in the control room", () => {
    expect(computeRoom("seed-control", room("seed-control").projections).mesas).toHaveLength(SEED_EXPECTATIONS["seed-control"].mesas);
  });
});

// Small rooms with hand-made unit vectors: same vector = same meaning, orthogonal = unrelated.
const axis = (i: number, dims = 8) => Array.from({ length: dims }, (_, k) => (k === i ? 1 : 0));
const blend = (i: number, j: number, w: number) => {
  const v = axis(i).map((x, k) => x * Math.cos(w) + axis(j)[k] * Math.sin(w));
  return v;
};
type T = [name: string, kind: PublicProjection["topics"][number]["kind"], depth: 1 | 2 | 3, embedding: number[]];
const person = (id: string, topics: T[]): PublicProjection => ({
  personId: id,
  displayName: id,
  topics: topics.map(([name, kind, depth, embedding]) => ({ id: `${id}.${name}`, name, kind, depth, sources: ["claude"], embedding })),
});

describe("buildThemes", () => {
  it("names a theme after its most common topic and does not chain through it", () => {
    // a ~ b (cos 0.71) and b ~ c (cos 0.71), but a and c are unrelated: b joins a, c leads its own.
    const a = axis(0);
    const b = blend(0, 1, Math.PI / 4);
    const c = axis(1);
    const { themes } = buildThemes([
      person("p1", [["alfa", "le_gusta", 2, a]]),
      person("p2", [["alfa", "le_gusta", 2, a], ["beta", "le_gusta", 2, b]]),
      person("p3", [["gama", "le_gusta", 2, c]]),
    ]);
    expect(themes.map((t) => [t.name, t.topicIds])).toEqual([
      ["alfa", ["p1.alfa", "p2.alfa", "p2.beta"]],
      ["gama", ["p3.gama"]],
    ]);
  });

  it("treats accents and case as the same topic", () => {
    const { themes } = buildThemes([person("p1", [["Cerámica", "hace", 2, axis(0)]]), person("p2", [["ceramica", "hace", 2, axis(3)]])]);
    expect(themes).toHaveLength(1);
  });
});

describe("scoreMesa", () => {
  it("adds complement, cohesion, and penalizes only the seated role repeated", () => {
    const projections = [
      person("ana", [["escalada", "sabe", 3, axis(0)], ["jazz", "le_gusta", 2, axis(1)]]),
      person("carla", [["escalada", "quiere_ser", 1, axis(0)], ["jazz", "le_gusta", 2, axis(1)]]),
      person("dani", [["escalada", "quiere_ser", 1, axis(0)], ["jazz", "le_gusta", 2, axis(1)]]),
      person("eva", [["surf", "hace", 3, axis(2)]]),
    ];
    const index = buildIndex(projections);
    const seat = (personId: string, role: string) => index.entriesOf.get(personId)!.find((e) => e.role === role)!;
    const score = scoreMesa([seat("ana", "aporta"), seat("carla", "busca"), seat("dani", "busca")], index);
    // escalada: aporta depth 3 over 3 people = 1; cohesion in escalada and jazz; dani repeats carla's seat.
    expect(score).toEqual({ complemento: 1, cohesion: 1, redundancia: 0.5, total: 1.5 });
  });
});
