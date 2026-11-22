import { cosine } from "@/lib/vector";
import type { PublicProjection, PublicTopic, Role } from "@/lib/types";

// Visual preview of layers 3–4 only. The real room engine (front C) lives in src/lib/room/.

type TopicNode = { name: string; embedding: number[]; personIds: string[] };
type Similarity = { a: string; b: string; score: number };
export type PreviewTheme = {
  id: string;
  name: string;
  topicNames: string[];
  roles: Record<Role, string[]>;
  outcome: "complemento" | "afinidad" | "sin mesa";
  personCount: number;
};

export const ROLE_ORDER: Role[] = ["aporta", "busca", "comparte"];

export function rolesOf(topic: Pick<PublicTopic, "kind" | "depth">): Role[] {
  const roles: Role[] = [];
  const { kind, depth } = topic;
  if (((kind === "sabe" || kind === "hace") && depth >= 2) || kind === "ofrece" || kind === "es") roles.push("aporta");
  if (kind === "busca" || kind === "quiere_ser" || (kind === "le_gusta" && depth === 1)) roles.push("busca");
  if (kind === "le_gusta" || kind === "hace") roles.push("comparte");
  return roles;
}

function topicNodes(projections: PublicProjection[]): TopicNode[] {
  const byName = new Map<string, TopicNode>();
  for (const person of projections) {
    for (const topic of person.topics) {
      if (!topic.embedding) continue;
      const node = byName.get(topic.name) ?? { name: topic.name, embedding: topic.embedding, personIds: [] };
      if (!node.personIds.includes(person.personId)) node.personIds.push(person.personId);
      byName.set(topic.name, node);
    }
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function similarities(nodes: TopicNode[], threshold: number): Similarity[] {
  const result: Similarity[] = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const score = cosine(nodes[i].embedding, nodes[j].embedding);
      if (score >= threshold) result.push({ a: nodes[i].name, b: nodes[j].name, score });
    }
  }
  return result;
}

export function previewThemes(projections: PublicProjection[], threshold: number): PreviewTheme[] {
  const nodes = topicNodes(projections);
  const parent = new Map(nodes.map((n) => [n.name, n.name]));
  const find = (name: string): string => (parent.get(name) === name ? name : find(parent.get(name)!));
  for (const { a, b } of similarities(nodes, threshold)) parent.set(find(a), find(b));

  const groups = new Map<string, TopicNode[]>();
  for (const node of nodes) groups.set(find(node.name), [...(groups.get(find(node.name)) ?? []), node]);

  return [...groups.values()]
    .map((group): PreviewTheme => {
      const names = new Set(group.map((n) => n.name));
      const roles: Record<Role, string[]> = { aporta: [], busca: [], comparte: [] };
      for (const person of projections) {
        for (const topic of person.topics) {
          if (!names.has(topic.name)) continue;
          for (const role of rolesOf(topic)) {
            if (!roles[role].includes(person.personId)) roles[role].push(person.personId);
          }
        }
      }
      const complement = roles.aporta.some((p) => roles.busca.some((q) => q !== p));
      const people = new Set(ROLE_ORDER.flatMap((r) => roles[r]));
      const anchor = [...group].sort((x, y) => y.personIds.length - x.personIds.length || x.name.localeCompare(y.name))[0];
      return {
        id: anchor.name,
        name: anchor.name,
        topicNames: group.map((n) => n.name),
        roles,
        outcome: complement ? "complemento" : roles.comparte.length >= 3 && people.size >= 3 ? "afinidad" : "sin mesa",
        personCount: people.size,
      };
    })
    .sort((a, b) => b.personCount - a.personCount || a.name.localeCompare(b.name));
}
