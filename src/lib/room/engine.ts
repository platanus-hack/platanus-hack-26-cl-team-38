import type { Mesa, PublicProjection, Theme } from "@/lib/types";
import { assign } from "./assign";
import { candidateMesas } from "./candidates";
import { buildIndex, type Draft } from "./model";
import { scoreMesa } from "./score";

export type RoomResult = { themes: Theme[]; mesas: Mesa[] };

// FNV-1a: a short, stable id, so the same mesa keeps its id across recomputes and Realtime
// sees an update instead of a delete and an insert.
function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(36);
}

function toMesa(roomId: string, draft: Draft, score: number): Mesa {
  const people = draft.members
    .map((m) => m.personId)
    .sort()
    .join("+");
  return {
    id: `${roomId}.${draft.anchorThemeId}.${hash(people)}`,
    roomId,
    anchorThemeId: draft.anchorThemeId,
    members: draft.members.map(({ personId, role, themeId, topicId }) => ({ personId, role, themeId, topicId })),
    score: Math.round(score * 1000) / 1000,
  };
}

// The room engine (front C): pure and deterministic. Input order does not matter, because people
// and their topics are sorted before anything else runs.
export function computeRoom(roomId: string, projections: PublicProjection[]): RoomResult {
  const sorted = [...projections]
    .sort((a, b) => (a.personId < b.personId ? -1 : 1))
    .map((p) => ({ ...p, topics: [...p.topics].sort((a, b) => (a.id < b.id ? -1 : 1)) }));
  const index = buildIndex(sorted);
  const mesas = assign(candidateMesas(index), index)
    .map((draft) => toMesa(roomId, draft, scoreMesa(draft.members, index).total))
    .sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1));
  return { themes: index.themes, mesas };
}
