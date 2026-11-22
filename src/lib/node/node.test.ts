import { describe, expect, it } from "vitest";
import { fingerprint } from "@/lib/privacy/taxonomy";
import type { Signal, TopicPrivacy } from "@/lib/types";
import { draftsFromSignals, needsVerdict, reconcile, setShared, type DraftTopic } from "./node";

const person = { personId: "p1", displayName: "Ana" };
const signal = (label: string, over: Partial<Signal> = {}): Signal => ({
  source: "claude",
  kind: "hace",
  label,
  strength: 0.7,
  evidence: "",
  ...over,
});
const verdict = (
  d: DraftTopic,
  level: TopicPrivacy["level"] = "segura",
): { draft: DraftTopic; verdict: TopicPrivacy } => ({
  draft: d,
  verdict: { level, checkedFor: fingerprint(d), decidedBy: "default" },
});
const start = (drafts: DraftTopic[]) =>
  reconcile(
    undefined,
    person,
    drafts,
    drafts.map((d) => verdict(d)),
  );

describe("draftsFromSignals", () => {
  it("gives distinct ids to names that fold to the same slug", () => {
    const ids = draftsFromSignals("p1", [signal("c++", { kind: "sabe" }), signal("c#", { kind: "sabe" })]).map(
      (d) => d.id,
    );
    expect(new Set(ids).size).toBe(2);
  });
});

describe("reconcile", () => {
  it("starts every topic private and drops sensitive ones", () => {
    const [climb, therapy] = draftsFromSignals("p1", [signal("escalada"), signal("terapia")]);
    const node = reconcile(undefined, person, [climb, therapy], [verdict(climb), verdict(therapy, "sensible")]);
    expect(node.topics.map((t) => [t.name, t.public])).toEqual([["escalada", false]]);
  });

  it("keeps the owner's decisions when another assistant corroborates a topic", () => {
    const first = draftsFromSignals("p1", [signal("escalada")]);
    const node = setShared(start(first), first[0].id, true);
    const again = draftsFromSignals("p1", [signal("escalada"), signal("escalada", { source: "chatgpt" })]);
    expect(needsVerdict(node, again)).toEqual([]);
    const [topic] = reconcile(node, person, again, []).topics;
    expect(topic).toMatchObject({ public: true, depth: 3, sources: ["chatgpt", "claude"] });
  });

  it("drops topics whose signals were removed", () => {
    const drafts = draftsFromSignals("p1", [signal("escalada"), signal("jazz", { kind: "le_gusta" })]);
    expect(reconcile(start(drafts), person, drafts.slice(1), []).topics.map((t) => t.name)).toEqual(["jazz"]);
  });

  it("asks for a new verdict when the kind changes", () => {
    const node = start(draftsFromSignals("p1", [signal("escalada")]));
    const changed = draftsFromSignals("p1", [signal("escalada", { kind: "busca" })]);
    expect(needsVerdict(node, changed)).toHaveLength(1);
    expect(reconcile(node, person, changed, []).topics).toEqual([]);
  });
});
