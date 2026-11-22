"use client";

import { useSyncExternalStore } from "react";
import { setShared } from "@/lib/node/node";
import type { PersonalNode, Signal, Source, SynthesisSignal, Topic, UserInfo } from "@/lib/types";

// Phone-local state. Stand-in for front B's IndexedDB store: same PersonalNode contract, kept in
// localStorage so the flow works today.

type OutboxEntry = { at: string; to: string; what: string };

/** Something you set out to do from Inicio: who you asked, and what your Agente must keep in mind. */
export type Initiative = { id: string; intent: string; members: string[]; restrictions: string[]; at: string };

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
  /** What you are looking for in Afinidades (shared with the desktop graph). */
  affinityQuery: string;
  /** Group Conversaciones you started from Inicio, newest first. */
  initiatives: Initiative[];
  /** A topic you added by hand, waiting for the privacy filter; `held` is the filter's count before. */
  pendingTopic: { id: string; name: string; share: boolean; held: number } | null;
  /** Perfil → Información. Owner-only: this copy, plus the server's `user_info` (POST /api/users/info). */
  info: UserInfo | null;
  /** People you asked to add as Contacto and who have not accepted yet. */
  requests: string[];
  /** Demo mode: the example requests you rejected, so they do not come back. */
  dismissed: string[];
  /** The Contacto you chose to start an Iniciativa with, until it is created or you take them out. */
  invite: string | null;
  /** Your own photo, as a small JPEG data URL. Stays in this phone: nobody else sees it yet. */
  photo: string | null;
  /** What you said in a Conversación, and your Agente's answer, by conversation id. */
  replies: Record<string, { id: string; from: string; text: string; at: string }[]>;
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
    affinityQuery: "",
    initiatives: [],
    info: null,
    requests: [],
    dismissed: [],
    invite: null,
    photo: null,
    replies: {},
    pendingTopic: null,
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
    writeSaved(
      [
        { ...current, focus: { topic: null, person: null } },
        ...savedSessions().filter((x) => x.personId !== current.personId),
      ].slice(0, 6),
    );
  }
  replace(fresh());
}

/** Come back to a session closed on this phone. */
export function resumeSession(personId: string): boolean {
  const saved = savedSessions();
  const found = saved.find((x) => x.personId === personId);
  if (!found) return false;
  writeSaved(saved.filter((x) => x.personId !== personId));
  replace(migrate({ ...fresh(), ...found }));
  return true;
}

/** Your depth for a topic. Survives a resync: see useNodeSync. */
export function setDepth(id: string, depth: Topic["depth"]) {
  setPhone((p) =>
    p.node ? { node: { ...p.node, topics: p.node.topics.map((t) => (t.id === id ? { ...t, depth } : t)) } } : {},
  );
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
