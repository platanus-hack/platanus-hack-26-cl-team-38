import type { Kind, PublicTopic } from "@/lib/types";

// What you share with someone: the topics you both publish, and whether one of you can help the other.
// Only public topics on both sides take part, so nothing private is ever compared.
// Matching is by normalized name for now; embeddings would also catch near synonyms.

type MatchType = "comun" | "te_ayuda" | "ayudas";
export type MatchItem = { type: MatchType; topic: string };
const WANTS: Kind[] = ["busca", "quiere_ser"];
const KNOWS: Kind[] = ["sabe", "hace", "es", "ofrece"];

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

function classify(mine: PublicTopic, theirs: PublicTopic): MatchItem {
  if (WANTS.includes(mine.kind) && KNOWS.includes(theirs.kind)) return { type: "te_ayuda", topic: mine.name };
  if (KNOWS.includes(mine.kind) && WANTS.includes(theirs.kind)) return { type: "ayudas", topic: mine.name };
  return { type: "comun", topic: mine.name };
}

const WEIGHT: Record<MatchType, number> = { te_ayuda: 3, ayudas: 3, comun: 1 };
const ORDER: Record<MatchType, number> = { te_ayuda: 0, ayudas: 1, comun: 2 };

export function matchTopics(mine: PublicTopic[], theirs: PublicTopic[]): { items: MatchItem[]; score: number } {
  const byName = new Map(mine.map((t) => [norm(t.name), t]));
  const items = theirs
    .map((t) => {
      const m = byName.get(norm(t.name));
      return m ? classify(m, t) : null;
    })
    .filter((x): x is MatchItem => x !== null)
    .sort((a, b) => ORDER[a.type] - ORDER[b.type]);
  return { items, score: items.reduce((s, i) => s + WEIGHT[i.type], 0) };
}

/** "sabe de python" (they can help you), "busca python" (you can help them), or just the topic. */
export function matchPhrase(i: MatchItem): string {
  const topic = i.topic ? i.topic[0].toLocaleUpperCase("es-CL") + i.topic.slice(1) : i.topic;
  if (i.type === "te_ayuda") return `sabe de ${topic}`;
  if (i.type === "ayudas") return `busca ${topic}`;
  return topic;
}
