import { withheld } from "@/lib/privacy/projection";
import type { Kind, Signal, Topic } from "@/lib/types";

// What Minga needs on top of the node operations in src/lib/node/node.ts: labels, roles, and which
// topics the room can see. The node itself is built there, with the privacy filter's verdicts.

export function slug(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** What the room sees: public, decided by you, with a current verdict that is not `sensible`. */
export const isPublished = (topic: Topic) => withheld(topic) === null;

/** "Nunca se comparte": the filter says `sensible`, or it has no verdict to publish with. */
export const isLocked = (topic: Pick<Topic, "privacy">) => !topic.privacy || topic.privacy.level === "sensible";

export const KIND_LABEL: Record<Kind, string> = {
  es: "es",
  sabe: "sabe",
  hace: "hace",
  le_gusta: "le gusta",
  quiere_ser: "quiere ser",
  busca: "busca",
  ofrece: "ofrece",
};

/** Signals to try the flow without pasting anything. */
export const EXAMPLE_SIGNALS: Signal[] = [
  { source: "claude", kind: "sabe", label: "diseño ux", strength: 0.9, evidence: "ejemplo" },
  { source: "claude", kind: "hace", label: "escalada", strength: 0.8, evidence: "ejemplo" },
  { source: "claude", kind: "sabe", label: "python", strength: 0.7, evidence: "ejemplo" },
  { source: "claude", kind: "quiere_ser", label: "fundar una startup", strength: 0.7, evidence: "ejemplo" },
  { source: "claude", kind: "busca", label: "socio técnico", strength: 0.6, evidence: "ejemplo" },
  { source: "claude", kind: "le_gusta", label: "jazz", strength: 0.6, evidence: "ejemplo" },
  { source: "claude", kind: "le_gusta", label: "fotografía de naturaleza", strength: 0.6, evidence: "ejemplo" },
  { source: "claude", kind: "hace", label: "cocina peruana", strength: 0.5, evidence: "ejemplo" },
  { source: "claude", kind: "busca", label: "terapia para la ansiedad", strength: 0.5, evidence: "ejemplo" },
];
