import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PROFILE_MAX_CHARS, PROFILE_MAX_LINES } from "@/lib/connectors/profile";
import { projectNode } from "@/lib/privacy/projection";
import { hasIdentifier, screenText } from "@/lib/privacy/screen";
import { fingerprint } from "@/lib/privacy/taxonomy";
import { connectionGraph, degreesFrom, network, renderProfile, slugOf, toV1 } from "./network";
import { SEED_ROOMS } from "./people";
import { team } from "./team";

const v1 = JSON.parse(readFileSync(new URL("./network.v1.json", import.meta.url), "utf8"));
const ids = new Set([...network.team, ...network.people.map((p) => p.personId)]);

// Friend lists are unordered: compare them sorted.
const bySlug = (a: { slug: string }, b: { slug: string }) => a.slug.localeCompare(b.slug);
const sortFriends = <T extends { friends: { slug: string }[] }>(nodes: T[]) =>
  nodes.map((n) => ({ ...n, friends: [...n.friends].sort(bySlug) }));

// v2 drops the names of the date decisions on purpose (see PurposeSchema): everything else must match.
const DROPPED_VARIABLES = new Set(["fecha", "fechas", "fecha de entrada"]);
const withoutDroppedVariables = (events: { decisions: { variable?: string }[] }[]) =>
  events.map((e) => ({
    ...e,
    decisions: e.decisions.map(({ variable, ...d }) =>
      variable && !DROPPED_VARIABLES.has(variable) ? { variable, ...d } : d,
    ),
  }));

describe("seed/network.v2.json", () => {
  it("loses nothing from the hand-written v1", () => {
    const rebuilt = toV1();
    expect({
      ...rebuilt,
      description: undefined,
      team: sortFriends(rebuilt.team),
      people: sortFriends(rebuilt.people),
    }).toEqual({
      ...v1,
      description: undefined,
      team: sortFriends(v1.team),
      people: sortFriends(v1.people),
      events: withoutDroppedVariables(v1.events),
    });
  });

  it("no decision is named after a date", () => {
    for (const d of network.purposes.flatMap((p) => p.decisions)) expect(d.variable ?? "").not.toMatch(/fecha/i);
  });

  it("has at least 50 people whose ids don't collide with the rest of the seed", () => {
    expect(network.people.length).toBeGreaterThanOrEqual(50);
    expect(new Set(network.people.map((p) => p.personId)).size).toBe(network.people.length);
    // Person ids are seed-<slug> in every room, so a repeated slug would merge two people. The hack room
    // brings some network people on purpose: those must be the same person, with the same topics.
    const others = SEED_ROOMS.filter((r) => ["seed-mut", "seed-hack", "seed-control"].includes(r.id)).flatMap(
      (r) => r.people,
    );
    for (const p of network.people)
      for (const other of others.filter((o) => `seed-${o.slug}` === p.personId))
        expect(
          other.topics.map(([name]) => name),
          p.personId,
        ).toEqual(p.topics.map((t) => t.name));
  });

  it("only names teammates that exist in seed/team", () => {
    for (const id of network.team) expect(team.map((t) => t.slug)).toContain(slugOf(id));
  });

  describe("public part, against the contracts in types.ts", () => {
    it.each(network.people.map((p) => [p.personId, p] as const))(
      "%s publishes every topic through projectNode()",
      (_id, person) => {
        const { projection, withheld } = projectNode({
          personId: person.personId,
          displayName: person.displayName,
          version: 1,
          topics: person.topics,
        });
        expect(withheld).toEqual([]);
        expect(projection.topics.map((t) => t.id)).toEqual(person.topics.map((t) => t.id));
        for (const topic of person.topics) expect(topic.privacy.checkedFor, topic.id).toBe(fingerprint(topic));
      },
    );

    it("follows the synthesizer's depth caps", () => {
      for (const topic of network.people.flatMap((p) => p.topics)) {
        if (topic.kind === "le_gusta") expect(topic.depth, topic.id).toBeLessThanOrEqual(2);
        if (topic.kind === "busca" || topic.kind === "quiere_ser") expect(topic.depth, topic.id).toBe(1);
        if (topic.depth === 3) expect(["sabe", "hace", "es", "ofrece"], topic.id).toContain(topic.kind);
      }
    });
  });

  describe("detailed profile", () => {
    it.each(network.people.map((p) => [p.personId, renderProfile(p)] as const))(
      "%s fits the limits and no line trips the privacy lexicon",
      (_id, markdown) => {
        expect(markdown.length).toBeLessThanOrEqual(PROFILE_MAX_CHARS);
        expect(markdown.split("\n").length).toBeLessThanOrEqual(PROFILE_MAX_LINES);
        for (const line of markdown.split("\n").filter((l) => l.startsWith("- "))) {
          expect(screenText(line.slice(2)), line).toBeNull();
          expect(hasIdentifier(line), line).toBe(false);
        }
      },
    );

    // "San Pedro de Atacama" is a place, not Pedro.
    it("doesn't name anyone in the network", () => {
      const names = network.people.map((p) => p.displayName.split(" ")[0]).filter((n) => n.length > 3);
      for (const person of network.people)
        for (const name of names)
          expect(renderProfile(person), `${person.personId}: ${name}`).not.toMatch(
            new RegExp(`(?<!San )\\b${name}\\b`),
          );
    });
  });

  describe("connections", () => {
    it("follow the table's rules: a < b, one row per pair, both ends exist", () => {
      const pairs = network.connections.map((c) => `${c.a}|${c.b}`);
      expect(new Set(pairs).size).toBe(pairs.length);
      for (const c of network.connections) {
        expect(c.a < c.b, `${c.a} ${c.b}`).toBe(true);
        expect(ids).toContain(c.a);
        expect(ids).toContain(c.b);
        expect(Object.keys(c.pending.detail).sort()).toEqual([c.a, c.b].sort());
        expect(hasIdentifier(c.origin.place)).toBe(false);
      }
    });

    it("aren't a clique, but put everyone within three steps of the team", () => {
      const n = ids.size;
      expect(network.connections.length / ((n * (n - 1)) / 2)).toBeLessThan(0.1);
      const degrees = degreesFrom(network.team);
      for (const p of network.people) expect(degrees.get(p.personId), p.personId).toBeLessThanOrEqual(3);
      for (const d of [1, 2, 3])
        expect(network.people.filter((p) => degrees.get(p.personId) === d).length).toBeGreaterThan(5);
    });
  });

  describe.each(network.purposes.map((e) => [e.eventId, e] as const))("%s", (_id, purpose) => {
    const room = network.rooms.find((r) => r.id === purpose.roomId);
    const inRoom = purpose.roles.map((r) => r.personId);

    it("has a room with exactly its participants, and the seed room matches", () => {
      expect(room?.members).toEqual(inRoom);
      expect(SEED_ROOMS.find((r) => r.id === purpose.roomId)?.people.map((p) => `seed-${p.slug}`)).toEqual(inRoom);
      for (const id of purpose.organizers) expect(inRoom).toContain(id);
    });

    // Teammates come from seed/team, which has no agentOnly: they join a case as guests, unless the case is
    // about them too (teamAgentOnly).
    it("gives every synthetic participant something only their agent reads for this case", () => {
      for (const id of inRoom.filter((id) => !network.team.includes(id) || network.teamAgentOnly[id])) {
        const agentOnly = network.people.find((p) => p.personId === id)?.agentOnly ?? network.teamAgentOnly[id];
        expect(
          agentOnly.constraints.some((c) => c.appliesTo.includes(purpose.type)),
          id,
        ).toBe(true);
      }
    });

    it("has helpers outside the room at the declared distance, some of them three steps away", () => {
      const degrees = degreesFrom(purpose.organizers, connectionGraph());
      for (const h of purpose.helpers) {
        expect(inRoom, h.personId).not.toContain(h.personId);
        expect(degrees.get(h.personId), h.personId).toBe(h.degree);
      }
      expect(purpose.helpers.some((h) => h.degree === 3)).toBe(true);
    });
  });
});
