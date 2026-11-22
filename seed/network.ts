import { readFileSync } from "node:fs";
import { z } from "zod";
import { KindSchema, SourceSchema, TopicSchema } from "@/lib/types";

// seed/network.v2.json: 53 synthetic people for three coordination cases (a wedding, a family trip, a
// flat hunt with roomies), laid out by where each piece goes in the data model:
//   - personId, displayName, topics            → users, user_topics, room_members (contracts in types.ts)
//   - profile                                  → perfil detallado (Markdown, renderProfile())
//   - agentOnly                                → what only the person's own agent reads: member_intents
//                                                (proposal I1 in docs/infra-propuestas.md, not built)
//   - seedOnly                                 → never published (age, comuna, the original bio)
//   - connections                              → connections; `pending` has what the table has no column for
//   - rooms                                    → rooms, room_members
//   - purposes                                 → "sala con propósito" (docs/casos-de-uso.md), not modeled
// toV1() rebuilds seed/network.v1.json, the hand-written original, and network.test.ts checks nothing
// was lost on the way.

const CaseSchema = z.enum(["matrimonio", "viaje", "arriendo"]);
const PersonIdSchema = z.string().regex(/^seed-[a-z0-9-]+$/);
const Facts = z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]));

const ExperienceSchema = z.object({
  title: z.string().min(1),
  type: z.enum(["matrimonio", "viaje", "vivienda", "trabajo", "estudios", "evento"]),
  place: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}$/),
  // The original wording, third person: kept for agents' context and for toV1(), never published.
  summary: z.string().min(1),
  facts: Facts.optional(),
  usefulFor: z.array(CaseSchema).min(1),
  // What goes into the detailed profile: first person, no third parties' names, no health.
  line: z.string().min(1),
});

const ConstraintSchema = z
  .object({
    type: z.enum(["fecha", "presupuesto", "salud", "movilidad", "alimentacion", "vivienda", "logistica", "preferencia", "idioma"]),
    detail: z.string().min(1),
    // true: can't be negotiated; false: a preference the plan can trade off.
    hard: z.boolean(),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    amountClp: z.number().int().positive().optional(),
    per: z.enum(["total", "mes", "noche", "persona"]).optional(),
    appliesTo: z.array(CaseSchema).min(1),
  })
  .catchall(z.union([z.string(), z.number(), z.boolean()]));

// Seed topics are written by hand, so publishing them is the author's decision (`decidedBy: "user"`);
// the level comes from the local layers of the privacy filter (no judge).
const SeedTopicSchema = TopicSchema.extend({ public: z.literal(true), privacy: TopicSchema.shape.privacy.unwrap() });

export const PersonSchema = z.object({
  personId: PersonIdSchema,
  displayName: z.string().min(1),
  topics: z.array(SeedTopicSchema).min(1),
  profile: z.object({
    profession: z.string().min(1),
    hobbies: z.array(z.string().min(1)),
    languages: z.array(z.string().min(1)),
    diet: z.enum(["omnivora", "vegetariana", "vegana", "pescetariana", "halal", "kosher"]),
    about: z.string().min(1),
    experiences: z.array(ExperienceSchema),
  }),
  agentOnly: z.object({
    // Health data: the privacy filter would drop it from the profile, but the plan has to respect it.
    allergies: z.array(z.string().min(1)).optional(),
    constraints: z.array(ConstraintSchema),
  }),
  seedOnly: z.object({ age: z.number().int().positive(), comuna: z.string().min(1), region: z.string().min(1), bio: z.string().min(1) }),
});

const RelationSchema = z.enum(["pareja", "familia", "amistad", "trabajo", "estudios", "vecindad", "conocido"]);

export const SeedConnectionSchema = z.object({
  // Same order rule as the table: a < b.
  a: PersonIdSchema,
  b: PersonIdSchema,
  // `origin: { place }` in POST /api/connections, stored as origin_kind 'lugar' and origin_label.
  origin: z.object({ place: z.string().min(1) }),
  // No column in `connections` yet.
  pending: z.object({
    relation: RelationSchema,
    closeness: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    // What each one is to the other, keyed by personId ("papá", "colega en la healthtech").
    detail: z.record(PersonIdSchema, z.string().min(1)),
  }),
});

const RoomSchema = z.object({ id: z.string().regex(/^seed-[a-z0-9-]+$/), code: z.string().length(6), name: z.string().min(1), members: z.array(PersonIdSchema).min(3) });

const PurposeSchema = z.object({
  eventId: z.string().min(1),
  roomId: z.string(),
  type: CaseSchema,
  title: z.string().min(1),
  summary: z.string().min(1),
  organizers: z.array(PersonIdSchema).min(1),
  roles: z.array(z.object({ personId: PersonIdSchema, role: z.string().min(1) })).min(3),
  dependents: z.array(z.object({ name: z.string(), age: z.number().int(), with: PersonIdSchema })).optional(),
  decisions: z.array(z.object({ variable: z.string().min(1) }).catchall(z.unknown())).min(1),
  tensions: z.array(z.string().min(1)).min(1),
  // People outside the room whose experience helps, and how many connection steps from the organizers.
  helpers: z.array(z.object({ personId: PersonIdSchema, degree: z.number().int().positive(), why: z.string().min(1) })),
});

export const NetworkV2Schema = z.object({
  version: z.literal(2),
  description: z.string(),
  // Teammates live in seed/team/<slug>.json; they appear here only through connections.
  team: z.array(PersonIdSchema),
  people: z.array(PersonSchema).min(50),
  connections: z.array(SeedConnectionSchema),
  rooms: z.array(RoomSchema),
  purposes: z.array(PurposeSchema),
});

export type NetworkV2 = z.infer<typeof NetworkV2Schema>;
export type SeedNetworkPerson = z.infer<typeof PersonSchema>;
export type SeedConnection = z.infer<typeof SeedConnectionSchema>;
export type Purpose = z.infer<typeof PurposeSchema>;

export const network: NetworkV2 = NetworkV2Schema.parse(JSON.parse(readFileSync(new URL("./network.v2.json", import.meta.url), "utf8")));

export const slugOf = (personId: string) => personId.replace(/^seed-/, "");

// The detailed profile as an assistant would write it (sections of buildProfilePrompt()), first
// person and one idea per bullet. What has no section here lives in agentOnly or seedOnly.
const DIET_LINE: Record<SeedNetworkPerson["profile"]["diet"], string> = {
  omnivora: "Como de todo.",
  vegetariana: "Como vegetariano.",
  vegana: "Como vegano.",
  pescetariana: "Como pescado, pero no carne.",
  halal: "Como halal.",
  kosher: "Como kosher.",
};

const listOf = (items: string[]) => (items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} y ${items.at(-1)}`);

export function renderProfile(person: SeedNetworkPerson): string {
  const { profile } = person;
  const sections: [string, string[]][] = [
    ["Oficio y experiencia", [profile.about, ...profile.experiences.filter((x) => x.type === "trabajo" || x.type === "estudios").map((x) => x.line)]],
    ["Hobbies y tiempo libre", profile.hobbies.length ? [`En mi tiempo libre: ${listOf(profile.hobbies)}.`] : []],
    ["Viajes", profile.experiences.filter((x) => x.type === "viaje" || x.type === "vivienda").map((x) => x.line)],
    ["Comida y bebida", [DIET_LINE[profile.diet]]],
    ["Cómo planeo y decido en grupo", [`Puedo conversar en ${listOf(profile.languages)}.`, ...profile.experiences.filter((x) => x.type === "matrimonio" || x.type === "evento").map((x) => x.line)]],
  ];
  return sections
    .filter(([, lines]) => lines.length > 0)
    .map(([title, lines]) => [`## ${title}`, ...lines.map((l) => `- ${l}`)].join("\n"))
    .join("\n\n");
}

// Undirected connection graph over people and teammates.
export function connectionGraph(net: NetworkV2 = network): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>([...net.team, ...net.people.map((p) => p.personId)].map((id) => [id, new Set()]));
  for (const { a, b } of net.connections) {
    graph.get(a)?.add(b);
    graph.get(b)?.add(a);
  }
  return graph;
}

// Connection steps from the nearest of `from` to everyone reachable.
export function degreesFrom(from: string[], graph = connectionGraph()): Map<string, number> {
  const dist = new Map(from.map((s) => [s, 0]));
  const queue = [...from];
  while (queue.length) {
    const current = queue.shift()!;
    for (const next of graph.get(current) ?? []) {
      if (dist.has(next)) continue;
      dist.set(next, dist.get(current)! + 1);
      queue.push(next);
    }
  }
  return dist;
}

// ── v1: the original hand-written shape (seed/network.v1.json), one object per person with friends ──

type V1Friend = { slug: string; relation: z.infer<typeof RelationSchema>; detail: string; closeness: 1 | 2 | 3 };

export function toV1(net: NetworkV2 = network) {
  const friendsOf = (personId: string): V1Friend[] =>
    net.connections
      .filter((c) => c.a === personId || c.b === personId)
      .map((c) => {
        const other = c.a === personId ? c.b : c.a;
        return { slug: slugOf(other), relation: c.pending.relation, detail: c.pending.detail[personId], closeness: c.pending.closeness };
      });

  return {
    description: net.description,
    team: net.team.map((id) => ({ slug: slugOf(id), friends: friendsOf(id) })),
    people: net.people.map((p) => ({
      slug: slugOf(p.personId),
      displayName: p.displayName,
      age: p.seedOnly.age,
      comuna: p.seedOnly.comuna,
      region: p.seedOnly.region,
      bio: p.seedOnly.bio,
      profile: {
        profession: p.profile.profession,
        hobbies: p.profile.hobbies,
        languages: p.profile.languages,
        diet: p.profile.diet,
        ...(p.agentOnly.allergies && { allergies: p.agentOnly.allergies }),
      },
      topics: p.topics.map((t) => [t.name, t.kind, t.depth, t.sources] as [string, z.infer<typeof KindSchema>, 1 | 2 | 3, z.infer<typeof SourceSchema>[]]),
      experiences: p.profile.experiences.map(({ line, ...x }) => (void line, x)),
      constraints: p.agentOnly.constraints,
      friends: friendsOf(p.personId),
    })),
    events: net.purposes.map((e) => ({
      id: e.eventId,
      type: e.type,
      roomId: e.roomId,
      title: e.title,
      summary: e.summary,
      organizers: e.organizers.map(slugOf),
      participants: e.roles.map((r) => ({ slug: slugOf(r.personId), role: r.role })),
      ...(e.dependents && { dependents: e.dependents.map((d) => ({ ...d, with: slugOf(d.with) })) }),
      decisions: e.decisions,
      tensions: e.tensions,
      helpers: e.helpers.map((h) => ({ slug: slugOf(h.personId), degree: h.degree, why: h.why })),
    })),
  };
}
