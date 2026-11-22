"use client";

import { useEffect, useState } from "react";
import type { PublicProjection, PublicTopic, Source } from "@/lib/types";
import { isPublished } from "./node";
import { type MatchItem, matchTopics } from "./matches";
import type { PhoneState } from "./store";

// People you crossed paths with, and which of them are a coincidence: someone who was near you
// (within the smaller of your two distances) and shares at least one public interest with you.
//
// Demo mode (no Supabase key): the seed people, each with a sample encounter derived from their id.
// Supabase mode: people from room_members, at the place where they checked in. There is no
// location backend yet, so real distances don't exist: they count as 0 m.

export type Encounter = {
  person: PublicProjection;
  /** How close you were, in meters. */
  distanceM: number;
  /** Their own distance setting. */
  radiusM: number;
  at: string;
  place: string;
  agent?: Source;
  /** How you know them: a friend, an acquaintance, or just someone who was near. */
  relation: Relation;
};
export type Relation = "amigo" | "conocido" | "cercania";
export const RELATION: Record<Relation, { label: string; plural: string }> = {
  amigo: { label: "Amigo", plural: "Amigos" },
  conocido: { label: "Conocido", plural: "Conocidos" },
  cercania: { label: "Cercanía", plural: "Cercanía" },
};
export type Coincidence = Encounter & { items: MatchItem[]; score: number };
export type TopicGroup = { topic: string; people: Coincidence[] };

/** Distancia range for Coincidencias, in meters. */
export const RANGE = { min: 5, max: 50, step: 1, initial: 25 };
export const clampRadius = (m: number) => Math.min(RANGE.max, Math.max(RANGE.min, m));
export const DEMO = !(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);

const AI: Source[] = ["claude", "chatgpt", "gemini"];
const PLACES = [
  "MUT, Las Condes",
  "Barrio Italia, Providencia",
  "Parque Bicentenario, Vitacura",
  "Barrio Lastarria, Santiago",
  "Plaza Ñuñoa",
  "Cowork en Providencia",
  "Costanera Center",
];
const DISTANCES = [3, 5, 7, 9, 12, 15, 18, 22, 27, 33, 40, 48];
const THEIR_RADII = [15, 20, 30, 40, 50];
const RELATIONS: Relation[] = ["amigo", "conocido", "cercania", "cercania", "conocido", "amigo", "cercania"];

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

function agentOf(p: PublicProjection): Source | undefined {
  return p.topics.flatMap((t) => t.sources).find((s) => AI.includes(s));
}

function demoEncounter(person: PublicProjection, now: number): Encounter {
  const h = hash(person.personId);
  const minutesAgo = 20 + (h % (6 * 24 * 60));
  return {
    person,
    distanceM: DISTANCES[(h >>> 4) % DISTANCES.length],
    radiusM: THEIR_RADII[(h >>> 9) % THEIR_RADII.length],
    at: new Date(now - minutesAgo * 60_000).toISOString(),
    place: PLACES[(h >>> 13) % PLACES.length],
    agent: agentOf(person),
    relation: RELATIONS[(h >>> 17) % RELATIONS.length],
  };
}

async function loadDemo(): Promise<Encounter[]> {
  const { people } = (await (await fetch("/api/seed-people")).json()) as { people: PublicProjection[] };
  const now = Math.floor(Date.now() / 3_600_000) * 3_600_000; // stable within the hour
  return people.map((p) => demoEncounter(p, now));
}

async function loadSupabase(): Promise<Encounter[]> {
  const { supabase } = await import("@/lib/supabase/browser");
  const { data, error } = await supabase.from("room_members").select("projection, checked_in_at, rooms(name)");
  if (error) throw new Error(error.message);
  const byId = new Map<string, Encounter>();
  for (const row of data as unknown as { projection: PublicProjection; checked_in_at: string; rooms: { name: string } | null }[]) {
    byId.set(row.projection.personId, {
      person: row.projection,
      distanceM: 0,
      radiusM: RANGE.max,
      at: row.checked_in_at,
      place: row.rooms?.name ?? "Cerca tuyo",
      agent: agentOf(row.projection),
      relation: "cercania",
    });
  }
  return [...byId.values()];
}

let cache: Promise<Encounter[]> | undefined;

/** Everyone you crossed paths with (undefined while loading). */
export function useEncounters(): Encounter[] | undefined {
  const [list, setList] = useState<Encounter[]>();
  useEffect(() => {
    let alive = true;
    cache ??= (DEMO ? loadDemo() : loadSupabase()).catch((e) => {
      cache = undefined;
      throw e;
    });
    cache.then((l) => alive && setList(l)).catch(() => alive && setList([]));
    return () => {
      alive = false;
    };
  }, []);
  return list;
}

/** What you want to connect on. By default, everything you made public. */
export function myInterests(s: PhoneState): PublicTopic[] {
  return (s.node?.topics ?? [])
    .filter((t) => isPublished(t))
    .map(({ id, name, kind, depth, sources }) => ({ id, name, kind, depth, sources }));
}

/** The relation you set yourself wins over the one that came with the encounter. */
function withRelation(s: PhoneState, e: Encounter): Encounter {
  const mine = s.relations?.[e.person.personId];
  return mine ? { ...e, relation: mine } : e;
}

export function coincidences(s: PhoneState, encounters: Encounter[]): Coincidence[] {
  const mine = myInterests(s);
  return encounters
    .map((e) => withRelation(s, e))
    .filter((e) => e.person.personId !== s.personId && e.distanceM <= Math.min(clampRadius(s.radiusM), e.radiusM))
    .map((e) => ({ ...e, ...matchTopics(mine, e.person.topics) }))
    .filter((c) => c.items.length > 0)
    .sort((a, b) => b.score - a.score || a.distanceM - b.distanceM);
}

export function byTopic(coins: Coincidence[]): TopicGroup[] {
  const groups = new Map<string, Coincidence[]>();
  for (const c of coins) for (const i of c.items) groups.set(i.topic, [...(groups.get(i.topic) ?? []), c]);
  return [...groups.entries()]
    .map(([topic, people]) => ({ topic, people }))
    .sort((a, b) => b.people.length - a.people.length || a.topic.localeCompare(b.topic));
}

/** Every topic shows with a capital first letter, wherever it appears. */
const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

/** Afinidades search: who has a public topic with these letters, and which topics they are. */
export function searchTopics(contacts: Coincidence[], query: string): { ids: Set<string>; topics: string[] } | null {
  const q = fold(query);
  if (!q) return null;
  const ids = new Set<string>();
  const count = new Map<string, number>();
  for (const c of contacts) {
    for (const t of c.person.topics) {
      if (!fold(t.name).includes(q)) continue;
      ids.add(c.person.personId);
      const name = cap(t.name);
      count.set(name, (count.get(name) ?? 0) + 1);
    }
  }
  const topics = [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length).map(([name]) => name);
  return { ids, topics };
}

export function cap(s: string): string {
  return s ? s[0].toLocaleUpperCase("es-CL") + s.slice(1) : s;
}

/** Everyone you know or crossed paths with, matched on public Intereses (no Distancia filter). */
export function affinities(s: PhoneState, encounters: Encounter[]): Coincidence[] {
  const mine = myInterests(s);
  return encounters
    .map((e) => withRelation(s, e))
    .filter((e) => e.person.personId !== s.personId)
    .map((e) => ({ ...e, ...matchTopics(mine, e.person.topics) }))
    .sort((a, b) => b.score - a.score || a.distanceM - b.distanceM);
}

export function fmtDistance(m: number): string {
  if (m === 0) return "en el mismo lugar";
  return m < 1000 ? `a ${m} m` : `a ${(m / 1000).toLocaleString("es-CL", { maximumFractionDigits: 1 })} km`;
}

export function fmtRadius(m: number): string {
  return m < 1000 ? `${m} m` : `${m / 1000} km`;
}

export function relTime(iso: string): string {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (min < 60) return min <= 1 ? "recién" : `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? "ayer" : `hace ${d} días`;
}
