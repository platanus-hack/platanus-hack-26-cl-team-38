import { bestSeat } from "./candidates";
import { EPS, MESA_MAX, MESAS_PER_PERSON, type Draft, type RoomIndex } from "./model";
import { scoreMesa } from "./score";

const memberKey = (d: Draft) => `${d.anchorThemeId}|${d.members.map((m) => m.personId).sort().join("+")}`;

function overlap(a: Draft, b: Draft): number {
  const ids = new Set(a.members.map((m) => m.personId));
  return b.members.filter((m) => ids.has(m.personId)).length;
}

// Greedy with capacity: complement mesas by score, then affinity mesas by score. A mesa is accepted
// if everyone in it has room for one more and it shares fewer than 2 people with an accepted mesa
// on the same theme. Mesas on different themes may repeat people (decision 21-11): if the same
// group can meet about two subjects, both mesas form, up to 2 mesas per person.
// Then "nadie solo": whoever is left joins the open mesa where they raise the score the most, or,
// if none rises, the most cohesive open mesa.
export function assign(drafts: Draft[], index: RoomIndex): Draft[] {
  const score = (d: Draft) => scoreMesa(d.members, index);
  const rank = (a: Draft, b: Draft) => score(b).total - score(a).total || (memberKey(a) < memberKey(b) ? -1 : 1);
  const ordered = [...drafts.filter((d) => d.kind === "complemento").sort(rank), ...drafts.filter((d) => d.kind === "afinidad").sort(rank)];

  const count = new Map<string, number>();
  const accepted: Draft[] = [];
  for (const draft of ordered) {
    if (draft.members.some((m) => (count.get(m.personId) ?? 0) >= MESAS_PER_PERSON)) continue;
    if (accepted.some((a) => a.anchorThemeId === draft.anchorThemeId && overlap(a, draft) >= 2)) continue;
    accepted.push({ ...draft, members: [...draft.members] });
    for (const m of draft.members) count.set(m.personId, (count.get(m.personId) ?? 0) + 1);
  }

  for (const personId of index.people) {
    if (count.get(personId) || !index.entriesOf.get(personId)?.length) continue;
    const open = accepted.filter((d) => d.members.length < MESA_MAX);
    if (open.length === 0) break;

    const options = open.map((mesa) => {
      const before = score(mesa);
      const seat = bestSeat(mesa.members, personId, index)!;
      return { mesa, seat, gain: seat.score - before.total, cohesion: before.cohesion, total: before.total };
    });
    const rising = options.filter((o) => o.gain > EPS).sort((a, b) => b.gain - a.gain);
    const choice = rising[0] ?? [...options].sort((a, b) => b.cohesion - a.cohesion || b.total - a.total)[0];
    choice.mesa.members.push(choice.seat.entry);
    count.set(personId, 1);
  }
  return accepted;
}
