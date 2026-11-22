import type { PublicProjection, Role, Theme } from "@/lib/types";
import { ROLE_ORDER, rolesOf } from "./roles";
import { buildThemes, THEME_THRESHOLD } from "./themes";

export const MESA_MIN = 3;
export const MESA_MAX = 5;
export const MESAS_PER_PERSON = 2;
export const SEEDS_PER_THEME = 2;
export const EPS = 1e-9;

// One way a person can sit at a mesa: a role in a theme, backed by their deepest topic for it.
export type Entry = { personId: string; themeId: string; topicId: string; role: Role; depth: number };

export type RoomIndex = {
  themes: Theme[];
  people: string[];
  entriesOf: Map<string, Entry[]>;
  peopleIn: Map<string, number>;
};

export type Draft = { anchorThemeId: string; kind: "complemento" | "afinidad"; members: Entry[] };

const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export function buildIndex(projections: PublicProjection[], threshold = THEME_THRESHOLD): RoomIndex {
  const { themes, themeOf, peopleIn } = buildThemes(projections, threshold);
  const entriesOf = new Map<string, Entry[]>();

  for (const person of projections) {
    const best = new Map<string, Entry>();
    for (const topic of person.topics) {
      const themeId = themeOf.get(topic.id);
      if (!themeId) continue;
      for (const role of rolesOf(topic)) {
        const key = `${themeId}|${role}`;
        const current = best.get(key);
        if (!current || topic.depth > current.depth || (topic.depth === current.depth && topic.id < current.topicId)) {
          best.set(key, { personId: person.personId, themeId, topicId: topic.id, role, depth: topic.depth });
        }
      }
    }
    const entries = [...best.values()].sort(
      (a, b) => byText(a.themeId, b.themeId) || ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role),
    );
    entriesOf.set(person.personId, entries);
  }

  return { themes, people: projections.map((p) => p.personId), entriesOf, peopleIn };
}
