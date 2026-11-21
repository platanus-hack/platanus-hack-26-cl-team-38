"use client";

import { useSyncExternalStore } from "react";
import type { PersonalNode, Signal, Source, Topic } from "@/lib/types";

// Phone-local state. Stand-in for front B's IndexedDB store: same PersonalNode contract, kept in
// localStorage so the flow works today.

export type OutboxEntry = { at: string; to: string; what: string };

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

export function resetPhone() {
  state = fresh();
  persist(state);
  listeners.forEach((l) => l());
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
