"use client";

import { useSyncExternalStore } from "react";
import { setShared } from "@/lib/node/node";
import type { PersonalNode, Signal, Source, SynthesisSignal, Topic } from "@/lib/types";

// Phone-local state. Stand-in for front B's IndexedDB store: same PersonalNode contract, kept in
// localStorage so the flow works today.

export type OutboxEntry = { at: string; to: string; what: string };

export type PhoneState = {
  personId: string;
  /** Proves to the backend that this phone is `personId` (sent as `Authorization: Bearer`). Never shown. */
  deviceKey: string;
  /** The room you checked in to. Proximity and the backend routes need it. */
  room: { code: string; id: string; at: string } | null;
  displayName: string;
  /** Owner-only: evidence included. Never sent anywhere. */
  signals: Signal[];
  node: PersonalNode | null;
  onboarded: boolean;
  /** Today's intent: only your agent sees it. */
  intent: string;
  /** "Qué salió de mi teléfono": every upload, what and where. */
  outbox: OutboxEntry[];
  /** Coincidences count only within the smaller of your radius and theirs. */
  radiusM: number;
  /** Location is opt-in; we keep the place name, never the coordinates. */
  locationOn: boolean;
  place: { label: string; at: string } | null;
  /** What the coincidence graph is focused on (shared by the phone and the desktop panel). */
  focus: { topic: string | null; person: string | null };
  /** Privacidad: who can find you, and whether you show up in Coincidencias at all. */
  privacy: { visibility: "todos" | "conocidos" | "amigos"; discoverable: boolean; showPlace: boolean };
  /** People you added as Amigo or Conocido from Coincidencias (overrides what the network says). */
  relations: Record<string, "amigo" | "conocido">;
};

const KEY = "nodo.phone.v1";
// One identity for the whole app: /onboarding and /mi-nodo read team38.person.v1, /grafo and
// /explorar open as team38.me. Minga owns the personId and mirrors it there.
const PERSON_KEY = "team38.person.v1";
const ME_KEY = "team38.me";

function randomHex(bytes: number): string {
  // crypto.randomUUID needs a secure context; phones on the LAN over http don't have one.
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return [...buffer].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Someone who started in /onboarding keeps their personId here. */
function knownPersonId(): string | undefined {
  try {
    const raw = localStorage.getItem(PERSON_KEY);
    const id = raw ? (JSON.parse(raw) as { personId?: unknown }).personId : undefined;
    return typeof id === "string" && id ? id : undefined;
  } catch {
    return undefined;
  }
}

function fresh(personId = `p-${randomHex(6)}`): PhoneState {
  return {
    personId,
    // 32 random bytes: far above the backend's 32-character minimum, and not guessable.
    deviceKey: randomHex(32),
    room: null,
    displayName: "",
    signals: [],
    node: null,
    onboarded: false,
    intent: "",
    outbox: [],
    radiusM: 25,
    locationOn: false,
    place: null,
    focus: { topic: null, person: null },
    privacy: { visibility: "conocidos", discoverable: true, showPlace: true },
    relations: {},
  };
}

let state: PhoneState | undefined;
const listeners = new Set<() => void>();

// A node built before the privacy filter has topics without a verdict, which can never be
// published: those phones go back through the onboarding, keeping their signals.
function migrate(s: PhoneState): PhoneState {
  if (!s.node || s.node.topics.every((t) => t.privacy)) return s;
  return { ...s, node: null, onboarded: false, room: null };
}

function load(): PhoneState {
  let next: PhoneState | undefined;
  try {
    const raw = localStorage.getItem(KEY);
    // Older states lack deviceKey and room: fresh() fills them, and persisting keeps them.
    if (raw) next = migrate({ ...fresh(), ...(JSON.parse(raw) as Partial<PhoneState>) });
  } catch {
    // Private mode or corrupted data: start over.
  }
  next ??= fresh(knownPersonId());
  persist(next);
  return next;
}

function persist(next: PhoneState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
    localStorage.setItem(PERSON_KEY, JSON.stringify({ personId: next.personId, displayName: next.displayName }));
    localStorage.setItem(ME_KEY, next.personId);
  } catch {
    // Storage full or blocked: the session still works in memory.
  }
}

export function getPhone(): PhoneState {
  state ??= load();
  return state;
}

export function setPhone(patch: Partial<PhoneState> | ((s: PhoneState) => Partial<PhoneState>)) {
  const current = getPhone();
  state = { ...current, ...(typeof patch === "function" ? patch(current) : patch) };
  persist(state);
  listeners.forEach((l) => l());
}

export function resetPhone() {
  state = fresh();
  persist(state);
  listeners.forEach((l) => l());
}

/** Your depth for a topic. Survives a resync: see useNodeSync. */
export function setDepth(id: string, depth: Topic["depth"]) {
  setPhone((p) => (p.node ? { node: { ...p.node, topics: p.node.topics.map((t) => (t.id === id ? { ...t, depth } : t)) } } : {}));
}

/** Public or private, decided by you: only a topic you decided on can be published. */
export function setPublic(id: string, shared: boolean) {
  setPhone((p) => (p.node ? { node: setShared(p.node, id, shared) } : {}));
}

const signalKey = (x: Pick<Signal, "source" | "kind" | "label">) => `${x.source}:${x.kind}:${x.label}`;

/** Signals an assistant delivered (already through the privacy filter), merged with what you had. */
export function mergeSignals(arrived: SynthesisSignal[]) {
  setPhone((p) => {
    const merged = new Map(p.signals.map((x) => [signalKey(x), x]));
    for (const x of arrived) merged.set(signalKey(x), { ...x, evidence: "" });
    return { signals: [...merged.values()] };
  });
}

export function logOutbox(to: string, what: string) {
  setPhone((s) => ({ outbox: [{ at: new Date().toISOString(), to, what }, ...s.outbox].slice(0, 50) }));
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return;
    state = load();
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** undefined while rendering on the server or before hydration. */
export function usePhone(): PhoneState | undefined {
  return useSyncExternalStore(subscribe, getPhone, () => undefined);
}

export function connectedSources(s: PhoneState): Source[] {
  return [...new Set(s.signals.map((x) => x.source))];
}
