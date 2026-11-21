import type { Kind, Signal } from "@/lib/types";
import type { SeedTopic } from "./people";

// Seed-only stand-in for the real synthesizer (front B): exact-label merge plus the depth caps of the
// architecture, so a teammate's assistant output becomes seed topics without an LLM call.

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

export function synthesizeSeedTopics(signals: Signal[]): SeedTopic[] {
  const groups = new Map<string, Signal[]>();
  for (const signal of signals) groups.set(normalize(signal.label), [...(groups.get(normalize(signal.label)) ?? []), signal]);

  return [...groups.values()]
    .map((group): SeedTopic => {
      const strongest = [...group].sort((a, b) => b.strength - a.strength)[0];
      const sources = [...new Set(group.map((s) => s.source))].sort();
      return [strongest.label.trim().toLowerCase(), strongest.kind, depthFor(strongest.kind, strongest.strength, sources.length), sources];
    })
    .sort((a, b) => b[2] - a[2] || a[0].localeCompare(b[0]));
}
