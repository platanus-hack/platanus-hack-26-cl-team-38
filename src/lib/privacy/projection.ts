import { PublicProjectionSchema, type PersonalNode, type PublicProjection, type PublicTopic, type Topic } from "@/lib/types";
import { hasIdentifier, screen } from "./screen";
import { fingerprint } from "./taxonomy";

export type WithheldReason = "no_publicado" | "sin_revisar" | "revision_vencida" | "sin_decision" | "sensible";

// Why a topic stays out of the projection, or null when it would be published.
export function withheld(topic: Topic): WithheldReason | null {
  if (!topic.public) return "no_publicado";
  if (!topic.privacy) return "sin_revisar";
  if (topic.privacy.checkedFor !== fingerprint(topic)) return "revision_vencida";
  if (topic.privacy.decidedBy !== "user") return "sin_decision";
  // The stored level could have been tampered with or predate a lexicon change: screen again.
  if (topic.privacy.level === "sensible" || screen(topic)) return "sensible";
  return null;
}

// Only contact data: the lexicon would trip on first names such as "Cristiana".
function assertPublishableName(displayName: string): void {
  if (hasIdentifier(displayName)) throw new Error("displayName no puede publicarse: contiene un dato de contacto");
}

// The only way a personal node becomes public. Fields are copied one by one so that nothing
// owner-only (`privacy.reason`, `public`) can ride along.
export function projectNode(node: PersonalNode): {
  projection: PublicProjection;
  withheld: { topicId: string; reason: WithheldReason }[];
} {
  const topics: PublicTopic[] = [];
  const held: { topicId: string; reason: WithheldReason }[] = [];
  for (const topic of node.topics) {
    const reason = withheld(topic);
    if (reason) held.push({ topicId: topic.id, reason });
    else topics.push({ id: topic.id, name: topic.name, kind: topic.kind, depth: topic.depth, sources: topic.sources, embedding: topic.embedding });
  }
  assertPublishableName(node.displayName);
  return {
    projection: PublicProjectionSchema.parse({ personId: node.personId, displayName: node.displayName, topics }),
    withheld: held.filter((h) => h.reason !== "no_publicado"),
  };
}

export function toPublicProjection(node: PersonalNode): PublicProjection {
  return projectNode(node).projection;
}
