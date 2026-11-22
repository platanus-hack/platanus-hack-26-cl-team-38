import type { PublicTopic } from "@/lib/types";
import { COPY } from "./copy";
import { matchTopics } from "./matches";
import { cap, type Coincidence, type Encounter, firstName } from "./people";

const I = COPY.coincidencias.insights;
const MAX = 8;
const ARRIVED_MIN = 60;

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const name = (c: Encounter) => firstName(c.person.displayName);

/**
 * Lines about the people around you, from what both sides publish and nothing else: shared
 * Intereses, who can help whom, who is new, what is common nearby. Interleaved by kind so the
 * rotation never repeats the same sort of line twice in a row.
 */
export function networkInsights({
  mine,
  coins,
  near,
  contactIds,
  now = Date.now(),
}: {
  mine: PublicTopic[];
  /** In range and sharing at least one Interés with you, strongest first or not. */
  coins: Coincidence[];
  /** Everyone in range, you excluded. */
  near: Encounter[];
  contactIds: ReadonlySet<string>;
  now?: number;
}): string[] {
  const byTopic = new Map<string, Coincidence[]>();
  for (const c of coins) for (const i of c.items) byTopic.set(i.topic, [...(byTopic.get(i.topic) ?? []), c]);
  const shared = [...byTopic.entries()]
    .filter(([, people]) => people.length > 0)
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .map(([topic, people]) => I.shared(people.map(name), cap(topic)));

  const helps = coins.flatMap((c) =>
    c.items.filter((i) => i.type === "te_ayuda").map((i) => I.helpsYou(name(c), cap(i.topic))),
  );
  const helped = coins.flatMap((c) =>
    c.items.filter((i) => i.type === "ayudas").map((i) => I.youHelp(name(c), cap(i.topic))),
  );

  const ranked = [...coins].sort((a, b) => b.score - a.score || b.items.length - a.items.length);
  const closest = ranked[0] && ranked[0].items.length > 1 ? I.closest(name(ranked[0]), ranked[0].items.length) : null;
  const stranger = ranked.find((c) => c.items.length > 1 && !contactIds.has(c.person.personId));
  const notContact = stranger ? I.notContact(name(stranger), stranger.items.length) : null;

  const mineNames = new Set(mine.map((t) => norm(t.name)));
  const counts = new Map<string, { label: string; n: number }>();
  for (const e of near)
    for (const key of new Set(e.person.topics.map((t) => norm(t.name))))
      if (!mineNames.has(key)) {
        const label = e.person.topics.find((t) => norm(t.name) === key)!.name;
        counts.set(key, { label, n: (counts.get(key)?.n ?? 0) + 1 });
      }
  const trend = [...counts.values()].filter((t) => t.n >= 3).sort((a, b) => b.n - a.n)[0];

  let pair: { a: Coincidence; b: Coincidence; n: number } | null = null;
  for (let x = 0; x < coins.length; x++)
    for (let y = x + 1; y < coins.length; y++) {
      const n = matchTopics(coins[x].person.topics, coins[y].person.topics).items.length;
      if (n >= 2 && n > (pair?.n ?? 0)) pair = { a: coins[x], b: coins[y], n };
    }

  const newest = [...near].sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0];
  const minutes = newest ? Math.round((now - Date.parse(newest.at)) / 60_000) : Infinity;
  const arrived = newest && minutes >= 0 && minutes < ARRIVED_MIN ? I.arrived(name(newest), minutes) : null;

  const lines = [
    shared[0],
    helps[0],
    notContact ?? closest,
    trend ? I.trend(cap(trend.label), trend.n) : null,
    helped[0],
    pair ? I.pair(name(pair.a), name(pair.b), pair.n) : null,
    arrived,
    shared[1],
    helps[1],
    notContact && closest !== notContact ? closest : null,
    shared[2],
  ];
  return [...new Set(lines.filter((l): l is string => !!l))].slice(0, MAX);
}
