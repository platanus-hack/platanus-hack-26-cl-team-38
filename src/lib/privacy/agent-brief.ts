import type { PersonalNode, PublicProjection } from "@/lib/types";
import { projectNode } from "./projection";
import { fingerprint, fold } from "./taxonomy";

// What a member agent (layer 5) may know about its owner. The public projection is the only thing it
// can cite, match on or decide with. Private topics travel apart, as personality: they shape how the
// agent talks, never what it says or decides. Anything `sensible` never reaches the node at all.
export type AgentBrief = { projection: PublicProjection; personality: string[] };

export function agentBrief(node: PersonalNode): AgentBrief {
  const { projection } = projectNode({ ...node, topics: node.topics.filter((t) => t.privacy?.level !== "sensible") });
  const shared = new Set(projection.topics.map((t) => t.id));
  const personality = node.topics
    .filter((t) => !shared.has(t.id) && t.privacy && t.privacy.level !== "sensible" && t.privacy.checkedFor === fingerprint(t))
    .map((t) => t.name);
  return { projection, personality };
}

export const PERSONALITY_RULE =
  "Los rasgos de personalidad son privados. Úsalos solo para el tono y la forma de hablar. No los nombres, no los cites, no los uses como motivo para aceptar, rechazar ni proponer nada, y no los uses para buscar afinidad.";

// Deterministic guard on what the agent writes for the room: a private topic named in a public
// line means the line is discarded, whatever the model intended.
export function mentionsPrivate(text: string, brief: Pick<AgentBrief, "personality">): string[] {
  const haystack = ` ${fold(text).replace(/[^a-z0-9ñ]+/g, " ")} `;
  return brief.personality.filter((name) => haystack.includes(` ${fold(name).replace(/[^a-z0-9ñ]+/g, " ").trim()} `));
}
