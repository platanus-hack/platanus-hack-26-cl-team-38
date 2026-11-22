import { EPS, MESA_MAX, MESA_MIN, SEEDS_PER_THEME, type Draft, type Entry, type RoomIndex } from "./model";
import { scoreMesa } from "./score";

// The themes a newcomer can join the mesa through: its anchor, and any theme where 2 or more members
// already have a role. One member is not enough: people with many topics touch almost every theme,
// and then anyone gets in.
export function sharedThemes(anchorThemeId: string, members: Entry[], index: RoomIndex): Set<string> {
  const holders = new Map<string, number>();
  for (const personId of new Set(members.map((m) => m.personId))) {
    for (const themeId of new Set((index.entriesOf.get(personId) ?? []).map((e) => e.themeId))) {
      holders.set(themeId, (holders.get(themeId) ?? 0) + 1);
    }
  }
  return new Set([anchorThemeId, ...[...holders].filter(([, n]) => n >= 2).map(([themeId]) => themeId)]);
}

// The seat that raises the mesa's score the most for this person (ties: their first entry), even
// if no seat raises it: "nadie solo" needs a seat anyway. With `within`, only seats in those themes.
export function bestSeat(members: Entry[], personId: string, index: RoomIndex, within?: Set<string>): { entry: Entry; score: number } | undefined {
  let best: { entry: Entry; score: number } | undefined;
  for (const entry of index.entriesOf.get(personId) ?? []) {
    if (within && !within.has(entry.themeId)) continue;
    const score = scoreMesa([...members, entry], index).total;
    if (!best || score > best.score + EPS) best = { entry, score };
  }
  return best;
}

// Adds, one at a time, whoever raises the score the most, while it keeps rising and the mesa has room.
// A newcomer must join through a theme the group already shares (see sharedThemes): otherwise anyone
// who brings their own aporta/busca pair raises the score, and mesas fill up with strangers.
export function grow(anchorThemeId: string, members: Entry[], index: RoomIndex): Entry[] {
  let current = scoreMesa(members, index).total;
  while (members.length < MESA_MAX) {
    const within = sharedThemes(anchorThemeId, members, index);
    let best: { entry: Entry; score: number } | undefined;
    for (const personId of index.people) {
      if (members.some((m) => m.personId === personId)) continue;
      const seat = bestSeat(members, personId, index, within);
      if (seat && seat.score > (best?.score ?? current) + EPS) best = seat;
    }
    if (!best) break;
    members = [...members, best.entry];
    current = best.score;
  }
  return members;
}

function bestPerPerson(index: RoomIndex, themeId: string, role: Entry["role"]): Entry[] {
  return index.people
    .flatMap((p) => index.entriesOf.get(p)!.filter((e) => e.themeId === themeId && e.role === role))
    .sort((a, b) => b.depth - a.depth || (a.personId < b.personId ? -1 : 1));
}

export function candidateMesas(index: RoomIndex): Draft[] {
  const drafts: Draft[] = [];
  const seen = new Set<string>();
  const push = (draft: Draft) => {
    if (draft.members.length < MESA_MIN) return;
    // Same people on another theme is another mesa: only the same people on the same theme repeat.
    const key = `${draft.anchorThemeId}|${draft.members.map((m) => m.personId).sort().join("+")}`;
    if (seen.has(key)) return;
    seen.add(key);
    drafts.push(draft);
  };

  for (const theme of index.themes) {
    const aportas = bestPerPerson(index, theme.id, "aporta");
    const buscas = bestPerPerson(index, theme.id, "busca");
    const pairs = buscas.flatMap((busca) => {
      const aporta = aportas.find((a) => a.personId !== busca.personId);
      return aporta ? [[aporta, busca]] : [];
    });

    if (pairs.length > 0) {
      for (const seed of pairs.slice(0, SEEDS_PER_THEME)) push({ anchorThemeId: theme.id, kind: "complemento", members: grow(theme.id, seed, index) });
      continue;
    }

    // Backup: no one here teaches what someone seeks, but 3 or more people share it.
    const sharing = bestPerPerson(index, theme.id, "comparte");
    if (sharing.length >= MESA_MIN) push({ anchorThemeId: theme.id, kind: "afinidad", members: sharing.slice(0, MESA_MAX) });
  }
  return drafts;
}
