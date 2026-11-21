import type { Kind, Signal, Source } from "@/lib/types";

// Stand-in for the LLM synthesizer (front B): exact-label merge plus the depth caps of the
// architecture, so signals from an assistant become topics without a model call.

export type SynthesizedTopic = { name: string; kind: Kind; depth: 1 | 2 | 3; sources: Source[] };

const WANTS: Kind[] = ["busca", "quiere_ser"];
const CAN_BE_DEEP: Kind[] = ["sabe", "hace", "es", "ofrece"];

function normalize(label: string): string {
  return label.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim().replace(/\s+/g, " ");
}

function depthFor(kind: Kind, strength: number, sourceCount: number): 1 | 2 | 3 {
  if (WANTS.includes(kind)) return 1;
  const base = strength >= 0.85 ? 3 : strength >= 0.6 ? 2 : 1;
  const corroborated = Math.min(3, base + (sourceCount >= 2 ? 1 : 0));
  return Math.min(corroborated, CAN_BE_DEEP.includes(kind) ? 3 : 2) as 1 | 2 | 3;
}

export function synthesizeTopics(signals: Pick<Signal, "source" | "kind" | "label" | "strength">[]): SynthesizedTopic[] {
  const groups = new Map<string, typeof signals>();
  for (const signal of signals) groups.set(normalize(signal.label), [...(groups.get(normalize(signal.label)) ?? []), signal]);

  return [...groups.values()]
    .map((group): SynthesizedTopic => {
      const strongest = [...group].sort((a, b) => b.strength - a.strength)[0];
      const sources = [...new Set(group.map((s) => s.source))].sort();
      return { name: strongest.label.trim().toLowerCase(), kind: strongest.kind, depth: depthFor(strongest.kind, strongest.strength, sources.length), sources };
    })
    .sort((a, b) => b.depth - a.depth || a.name.localeCompare(b.name));
}
