import { describe, expect, it } from "vitest";
import seed from "../../../seed/rooms.json";
import type { PublicProjection } from "@/lib/types";
import { filterGraph, topicGraph, type LinkType } from "./graph";

const room = (id: string) => seed.rooms.find((r) => r.id === id)!.projections as PublicProjection[];
const ALL = new Set<LinkType>(["complemento", "afinidad"]);

describe("topicGraph", () => {
  it("points Carla's wish to climb at Ana's escalada as a complement", () => {
    const { links } = topicGraph(room("seed-mut"), 0.6);
    expect(links).toContainEqual(expect.objectContaining({ source: "seed-carla.escalada", target: "seed-ana.escalada", type: "complemento" }));
  });

  it("links jazz lovers by affinity", () => {
    const { links } = topicGraph(room("seed-mut"), 0.6);
    expect(links).toContainEqual(expect.objectContaining({ source: "seed-ana.jazz", target: "seed-bruno.jazz", type: "afinidad" }));
  });

  it("never links two topics of the same person", () => {
    const { nodes, links } = topicGraph(room("seed-mut"), 0.4);
    const owner = new Map(nodes.map((n) => [n.id, n.personId]));
    expect(links.every((l) => owner.get(l.source) !== owner.get(l.target))).toBe(true);
  });

  it("finds no links in the control room", () => {
    expect(topicGraph(room("seed-control"), 0.6).links).toEqual([]);
  });
});

describe("filterGraph", () => {
  it("keeps only my topics, the links that touch them and the topics at the other end", () => {
    const { nodes, links } = filterGraph(topicGraph(room("seed-mut"), 0.6), { me: "seed-carla", types: ALL });
    expect(links.length).toBeGreaterThan(0);
    expect(links.every((l) => l.source.startsWith("seed-carla.") || l.target.startsWith("seed-carla."))).toBe(true);
    expect(nodes.map((n) => n.personId)).not.toContain("seed-kevin");
  });

  it("drops the link types left out", () => {
    const { links } = filterGraph(topicGraph(room("seed-mut"), 0.6), { types: new Set<LinkType>(["complemento"]) });
    expect(links.every((l) => l.type === "complemento")).toBe(true);
  });
});
