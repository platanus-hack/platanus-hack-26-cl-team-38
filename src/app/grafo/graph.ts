import { cosine } from "@/lib/vector";
import type { PublicProjection, Role, Source } from "@/lib/types";
import { ROLE_ORDER, rolesOf } from "../explorar/preview";

// Topic-level view of layer 4: the same similarity that clusters themes in /explorar, drawn as edges
// between topics of different people. The real room engine (front C) lives in src/lib/room/.

export type LinkType = "complemento" | "afinidad";

export type TopicNode = {
  id: string;
  personId: string;
  name: string;
  role: Role;
  roles: Role[];
  depth: 1 | 2 | 3;
  sources: Source[];
  embedding: number[];
};

// Complemento always points from whoever busca to whoever aporta.
export type Link = { source: string; target: string; type: LinkType; score: number };

export type TopicGraph = { nodes: TopicNode[]; links: Link[] };

export function topicGraph(projections: PublicProjection[], threshold: number): TopicGraph {
  const nodes: TopicNode[] = projections.flatMap((person) =>
    person.topics
      .filter((t) => t.embedding)
      .map((t) => {
        const roles = rolesOf(t);
        return {
          id: t.id,
          personId: person.personId,
          name: t.name,
          role: ROLE_ORDER.find((r) => roles.includes(r)) ?? "comparte",
          roles,
          depth: t.depth,
          sources: t.sources,
          embedding: t.embedding!,
        };
      }),
  );

  const links: Link[] = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      if (a.personId === b.personId) continue;
      const score = cosine(a.embedding, b.embedding);
      if (score < threshold) continue;
      if (a.roles.includes("busca") && b.roles.includes("aporta")) links.push({ source: a.id, target: b.id, type: "complemento", score });
      else if (b.roles.includes("busca") && a.roles.includes("aporta")) links.push({ source: b.id, target: a.id, type: "complemento", score });
      else links.push({ source: a.id, target: b.id, type: "afinidad", score });
    }
  }
  return { nodes, links };
}

export function filterGraph(graph: TopicGraph, { me, types }: { me?: string; types: Set<LinkType> }): TopicGraph {
  const links = graph.links.filter((l) => types.has(l.type));
  if (!me) return { nodes: graph.nodes, links };

  const mine = new Set(graph.nodes.filter((n) => n.personId === me).map((n) => n.id));
  const myLinks = links.filter((l) => mine.has(l.source) || mine.has(l.target));
  const keep = new Set([...mine, ...myLinks.flatMap((l) => [l.source, l.target])]);
  return { nodes: graph.nodes.filter((n) => keep.has(n.id)), links: myLinks };
}
