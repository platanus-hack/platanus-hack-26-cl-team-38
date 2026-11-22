import { describe, expect, it } from "vitest";
import type { PersonalNode, Topic, TopicPrivacy } from "@/lib/types";
import { projectNode, toPublicProjection } from "./projection";
import { fingerprint } from "./taxonomy";

function topic(overrides: Omit<Partial<Topic>, "privacy"> & { privacy?: Partial<TopicPrivacy> } = {}): Topic {
  const base = {
    id: "p1.escalada",
    name: "escalada",
    kind: "hace" as const,
    depth: 2 as const,
    sources: ["claude" as const],
    public: true,
  };
  const merged = { ...base, ...overrides };
  const privacy =
    "privacy" in overrides && overrides.privacy === undefined
      ? undefined
      : { level: "segura" as const, checkedFor: fingerprint(merged), decidedBy: "user" as const, ...overrides.privacy };
  return { ...merged, privacy };
}

function node(...topics: Topic[]): PersonalNode {
  return { personId: "p1", displayName: "Ana", version: 1, topics };
}

describe("projectNode", () => {
  it("publishes a reviewed topic the owner chose to share, with exactly the public fields", () => {
    const withReason = topic({
      embedding: [0.1, 0.2],
      privacy: { level: "personal", reason: "solo para ti", saferName: "deporte" },
    });
    const { projection, withheld } = projectNode(node(withReason));
    expect(withheld).toEqual([]);
    expect(Object.keys(projection.topics[0]).sort()).toEqual(["depth", "embedding", "id", "kind", "name", "sources"]);
    expect(JSON.stringify(projection)).not.toContain("solo para ti");
  });

  it.each([
    ["was never reviewed", topic({ privacy: undefined }), "sin_revisar"],
    [
      "was renamed after the review",
      topic({ name: "escalada en roca", privacy: { checkedFor: fingerprint({ kind: "hace", name: "escalada" }) } }),
      "revision_vencida",
    ],
    [
      "changed kind after the review",
      topic({ kind: "busca", privacy: { checkedFor: fingerprint({ kind: "hace", name: "escalada" }) } }),
      "revision_vencida",
    ],
    ["was reviewed by an older classifier", topic({ privacy: { checkedFor: "v0:hace:escalada" } }), "revision_vencida"],
    ["was only recommended, not chosen", topic({ privacy: { decidedBy: "default" } }), "sin_decision"],
    ["is sensitive", topic({ privacy: { level: "sensible" } }), "sensible"],
    ["has a sensitive name under a forged verdict", topic({ name: "mi depresión" }), "sensible"],
  ] as const)("withholds a topic that %s", (_case, held, reason) => {
    const { projection, withheld } = projectNode(node(held, topic({ id: "p1.jazz", name: "jazz", kind: "le_gusta" })));
    expect(projection.topics.map((t) => t.id)).toEqual(["p1.jazz"]);
    expect(withheld).toEqual([{ topicId: held.id, reason }]);
  });

  it("leaves private topics out without reporting them", () => {
    expect(projectNode(node(topic({ public: false })))).toMatchObject({ projection: { topics: [] }, withheld: [] });
  });

  it("refuses a display name with contact data", () => {
    expect(() => toPublicProjection({ ...node(topic()), displayName: "Ana +56 9 8765 4321" })).toThrow(/displayName/);
    expect(toPublicProjection({ ...node(topic()), displayName: "Cristiana" }).displayName).toBe("Cristiana");
  });
});
