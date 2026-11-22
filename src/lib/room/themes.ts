import { cosine } from "@/lib/vector";
import type { PublicProjection, Theme } from "@/lib/types";

export const THEME_THRESHOLD = 0.6;

function normalizeName(name: string): string {
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim().replace(/\s+/g, " ");
}

function slug(key: string): string {
  return key.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "tema";
}

type NameGroup = { key: string; name: string; embedding: number[]; topicIds: string[]; people: Set<string> };

export type Themes = {
  themes: Theme[];
  // topic id → theme id, for every topic that landed in a theme (topics without an embedding do not).
  themeOf: Map<string, string>;
  // theme id → people in the room with any topic in it, the denominator of `complemento`.
  peopleIn: Map<string, number>;
};

// Leader clustering: topics with the same name are one node; nodes go in order of how many people
// have them (then name), and each joins the existing theme whose leader is closest at or above the
// threshold, or leads a new one. Comparing only against leaders avoids single-linkage chains
// (fotografía ~ edición ~ ilustración ~ animación), and the fixed order makes it deterministic.
export function buildThemes(projections: PublicProjection[], threshold = THEME_THRESHOLD): Themes {
  const groups = new Map<string, NameGroup>();
  for (const person of projections) {
    for (const topic of person.topics) {
      if (!topic.embedding) continue;
      const key = normalizeName(topic.name);
      const group = groups.get(key) ?? { key, name: topic.name.trim(), embedding: topic.embedding, topicIds: [], people: new Set() };
      group.topicIds.push(topic.id);
      group.people.add(person.personId);
      groups.set(key, group);
    }
  }

  const ordered = [...groups.values()].sort((a, b) => b.people.size - a.people.size || a.key.localeCompare(b.key));
  const clusters: { leader: NameGroup; members: NameGroup[] }[] = [];
  for (const group of ordered) {
    let best: (typeof clusters)[number] | undefined;
    let bestScore = threshold;
    for (const cluster of clusters) {
      const score = cosine(group.embedding, cluster.leader.embedding);
      if (score >= bestScore) [best, bestScore] = [cluster, score];
    }
    if (best) best.members.push(group);
    else clusters.push({ leader: group, members: [group] });
  }

  const themeOf = new Map<string, string>();
  const peopleIn = new Map<string, number>();
  const used = new Set<string>();
  const themes = clusters
    .map(({ leader, members }) => {
      let id = slug(leader.key);
      for (let n = 2; used.has(id); n++) id = `${slug(leader.key)}-${n}`;
      used.add(id);
      const topicIds = members.flatMap((m) => m.topicIds).sort();
      for (const topicId of topicIds) themeOf.set(topicId, id);
      peopleIn.set(id, new Set(members.flatMap((m) => [...m.people])).size);
      return { id, name: leader.name, topicIds };
    })
    .sort((a, b) => peopleIn.get(b.id)! - peopleIn.get(a.id)! || a.id.localeCompare(b.id));

  return { themes, themeOf, peopleIn };
}
