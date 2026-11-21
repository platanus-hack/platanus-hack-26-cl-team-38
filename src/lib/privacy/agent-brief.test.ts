import { describe, expect, it } from "vitest";
import type { PersonalNode, Topic } from "@/lib/types";
import { agentBrief, mentionsPrivate } from "./agent-brief";
import { fingerprint } from "./taxonomy";

const topic = (name: string, shared: boolean, level: "segura" | "personal" | "sensible" = "segura"): Topic => ({
  id: `p1.${name}`,
  name,
  kind: "le_gusta",
  depth: 2,
  sources: ["claude"],
  public: shared,
  privacy: { level, checkedFor: fingerprint({ kind: "le_gusta", name }), decidedBy: "user" },
});

const node: PersonalNode = {
  personId: "p1",
  displayName: "Ana",
  version: 1,
  topics: [topic("jazz", true), topic("poesía japonesa", false), topic("cocina vegana", false, "personal"), topic("ansiedad", true, "sensible")],
};

describe("agentBrief", () => {
  it("projects only public topics and keeps private ones as personality", () => {
    const brief = agentBrief(node);
    expect(brief.projection.topics.map((t) => t.name)).toEqual(["jazz"]);
    expect(brief.personality).toEqual(["poesía japonesa", "cocina vegana"]);
  });

  it("never carries a sensitive topic, even one marked public", () => {
    expect(JSON.stringify(agentBrief(node))).not.toContain("ansiedad");
  });

  it("leaves out a private topic whose verdict went stale", () => {
    const stale = { ...node, topics: [{ ...topic("poesía japonesa", false), name: "poesía" }] };
    expect(agentBrief(stale).personality).toEqual([]);
  });
});

describe("mentionsPrivate", () => {
  const brief = agentBrief(node);

  it("catches a private topic in a public line, with or without accents", () => {
    expect(mentionsPrivate("Me sumo, y de paso hablamos de poesia japonesa.", brief)).toEqual(["poesía japonesa"]);
  });

  it("does not flag a word that only contains the name", () => {
    expect(mentionsPrivate("Acepto: me encanta la idea del jazz.", { personality: ["jaz"] })).toEqual([]);
  });
});
