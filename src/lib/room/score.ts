import type { Entry, RoomIndex } from "./model";

export type ScoreBreakdown = { complemento: number; cohesion: number; redundancia: number; total: number };

// arquitectura-por-capas § Capa 4, "Puntaje de una mesa":
//   complemento = Σ temas t: [hay aporta y busca en t] × prof_max_aporta(t) / personas_en_sala_con(t)
//   cohesión    = 0,5 × temas en que 3 o más miembros tienen algún rol
//   redundancia = 0,5 × miembros que repiten el mismo rol y tema que otro
// Complemento and cohesión look at every role the members hold; redundancia only at the role each
// member was seated with, so three people who like jazz add cohesion instead of being penalized.
// Repeating comparte is not redundant either, or an affinity mesa could never score above zero.
export function scoreMesa(members: Entry[], index: RoomIndex): ScoreBreakdown {
  const byTheme = new Map<string, Map<string, Entry[]>>();
  for (const personId of new Set(members.map((m) => m.personId))) {
    for (const entry of index.entriesOf.get(personId) ?? []) {
      const people = byTheme.get(entry.themeId) ?? new Map<string, Entry[]>();
      people.set(personId, [...(people.get(personId) ?? []), entry]);
      byTheme.set(entry.themeId, people);
    }
  }

  let complemento = 0;
  let cohesiveThemes = 0;
  for (const [themeId, people] of byTheme) {
    if (people.size >= 3) cohesiveThemes++;
    let deepest = 0;
    for (const [personId, entries] of people) {
      const aporta = entries.find((e) => e.role === "aporta");
      if (!aporta || aporta.depth <= deepest) continue;
      const someoneSeeks = [...people].some(([other, es]) => other !== personId && es.some((e) => e.role === "busca"));
      if (someoneSeeks) deepest = aporta.depth;
    }
    if (deepest > 0) complemento += deepest / (index.peopleIn.get(themeId) ?? 1);
  }

  const seated = new Set<string>();
  let repeats = 0;
  for (const m of members) {
    // Sharing is the point of comparte: three people seated to share a theme are not redundant.
    if (m.role === "comparte") continue;
    const key = `${m.role}|${m.themeId}`;
    if (seated.has(key)) repeats++;
    else seated.add(key);
  }

  const cohesion = 0.5 * cohesiveThemes;
  const redundancia = 0.5 * repeats;
  return { complemento, cohesion, redundancia, total: complemento + cohesion - redundancia };
}
