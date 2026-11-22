"use client";

import { useSyncExternalStore } from "react";
import type { PersonalNode, Signal, Source, Topic } from "@/lib/types";

// Phone-local state. Stand-in for front B's IndexedDB store: same PersonalNode contract, kept in
// localStorage so the flow works today.

export type OutboxEntry = { at: string; to: string; what: string };

/** Something you set out to do from Inicio: who you asked, and what your Agente must keep in mind. */
export type Initiative = { id: string; intent: string; members: string[]; restrictions: string[]; at: string };

export type PhoneState = {
  personId: string;
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
  /** What you are looking for in Afinidades (shared with the desktop graph). */
  affinityQuery: string;
  /** Group Conversaciones you started from Inicio, newest first. */
  initiatives: Initiative[];
};

const KEY = "nodo.phone.v1";

function randomId(): string {
  // crypto.randomUUID needs a secure context; phones on the LAN over http don't have one.
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return `p-${[...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

function fresh(): PhoneState {
  return {
    personId: randomId(),
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
    affinityQuery: "",
    initiatives: [],
  };
}

let state: PhoneState | undefined;
const listeners = new Set<() => void>();

function load(): PhoneState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...fresh(), ...(JSON.parse(raw) as Partial<PhoneState>) };
  } catch {
    // Private mode or corrupted data: start over.
  }
  const next = fresh();
  persist(next);
  return next;
}

function persist(next: PhoneState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
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

/** Borrar mi Nodo: gone from this phone, saved session included. */
export function resetPhone() {
  writeSaved(savedSessions().filter((x) => x.personId !== getPhone().personId));
  replace(fresh());
}

function replace(next: PhoneState) {
  state = next;
  persist(state);
  listeners.forEach((l) => l());
}

// Sessions you closed on this phone: your Nodo stays here, so you can come back without
// starting over (and the demo can switch between profiles).
const SAVED_KEY = "nodo.sessions.v1";

export function savedSessions(): PhoneState[] {
  try {
    const raw = localStorage.getItem(SAVED_KEY);
    return raw ? (JSON.parse(raw) as PhoneState[]) : [];
  } catch {
    return [];
  }
}

function writeSaved(list: PhoneState[]) {
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(list));
  } catch {
    // Storage full or blocked: the session is just not kept.
  }
}

/** Cerrar sesión: keep this session on the phone and leave it empty for someone else. */
export function signOut() {
  const current = getPhone();
  if (current.onboarded) {
    writeSaved([{ ...current, focus: { topic: null, person: null } }, ...savedSessions().filter((x) => x.personId !== current.personId)].slice(0, 6));
  }
  replace(fresh());
}

/** Come back to a session closed on this phone. */
export function resumeSession(personId: string): boolean {
  const saved = savedSessions();
  const found = saved.find((x) => x.personId === personId);
  if (!found) return false;
  writeSaved(saved.filter((x) => x.personId !== personId));
  replace({ ...fresh(), ...found });
  return true;
}

/** An edit to a topic (depth, public). Manual edits survive a resync: see buildNode. */
export function setTopic(id: string, patch: Partial<Topic>) {
  setPhone((p) => (p.node ? { node: { ...p.node, topics: p.node.topics.map((t) => (t.id === id ? { ...t, ...patch } : t)) } } : {}));
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
