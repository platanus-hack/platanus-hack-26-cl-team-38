import { projectNode, type WithheldReason } from "@/lib/privacy/projection";
import type { PersonalNode, PublicTopic, Topic } from "@/lib/types";

// What the summary screen shows, derived only from the node. The preview and the check-in body both
// come from projectNode(), so what the person sees is exactly what gets sent.

export type Summary = {
  recommended: Topic[];
  decide: Topic[];
  shared: PublicTopic[];
  keptCount: number;
  withheld: Map<string, WithheldReason>;
};

export function summarize(node: PersonalNode): Summary {
  // A `sensible` topic should never reach the node; if one does, the screen does not show it either.
  const visible = node.topics.filter((t) => t.privacy?.level !== "sensible");
  const { projection, withheld } = projectNode({ ...node, topics: visible });
  return {
    recommended: visible.filter((t) => t.privacy?.level === "segura"),
    decide: visible.filter((t) => t.privacy?.level !== "segura"),
    shared: projection.topics,
    keptCount: visible.length - projection.topics.length,
    withheld: new Map(withheld.map((w) => [w.topicId, w.reason])),
  };
}

export const WITHHELD_COPY: Record<WithheldReason, string> = {
  no_publicado: "No lo estás compartiendo.",
  sin_revisar: "No pudimos revisarlo. Edítalo para revisarlo de nuevo.",
  revision_vencida: "Cambió desde la última revisión. Edítalo para revisarlo de nuevo.",
  sin_decision: "Falta que decidas.",
  sensible: "No se puede compartir.",
};

export { checkInBody } from "@/lib/node/node";
