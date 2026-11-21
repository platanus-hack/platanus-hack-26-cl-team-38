import { describe, expect, it } from "vitest";
import type { Signal } from "@/lib/types";
import { synthesizeSeedTopics } from "./synthesize";

const signal = (over: Partial<Signal>): Signal => ({ source: "chatgpt", kind: "sabe", label: "x", strength: 0.7, evidence: "", ...over });

describe("synthesizeSeedTopics", () => {
  it("merges the same label across sources and raises depth for corroboration", () => {
    const topics = synthesizeSeedTopics([
      signal({ source: "claude", label: "Kubernetes", strength: 0.7 }),
      signal({ source: "chatgpt", label: "kubernetes ", strength: 0.65 }),
    ]);
    expect(topics).toEqual([["kubernetes", "sabe", 3, ["chatgpt", "claude"]]]);
  });

  it("caps le_gusta at 2 and keeps busca and quiere_ser at 1", () => {
    const topics = synthesizeSeedTopics([
      signal({ kind: "le_gusta", label: "jazz", strength: 0.99 }),
      signal({ kind: "busca", label: "aprender a escalar", strength: 0.99 }),
      signal({ kind: "quiere_ser", label: "fundar una startup", strength: 0.9 }),
    ]);
    expect(topics.map(([name, , depth]) => [name, depth])).toEqual([
      ["jazz", 2],
      ["aprender a escalar", 1],
      ["fundar una startup", 1],
    ]);
  });

  it("never outputs evidence", () => {
    const [topic] = synthesizeSeedTopics([signal({ evidence: "dato privado" })]);
    expect(JSON.stringify(topic)).not.toContain("dato privado");
  });
});
