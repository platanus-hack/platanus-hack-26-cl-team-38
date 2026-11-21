import { useState, useSyncExternalStore } from "react";
import { z } from "zod";
import { PersonalNodeSchema, SignalSchema, SourceSchema, type PersonalNode, type Signal, type SynthesisSignal } from "@/lib/types";

// Everything the onboarding knows lives on this phone. The server forgets signals as soon as the
// phone collects them, so they are saved here before anything else: a reload must not lose them.
const SIGNALS_KEY = "team38.signals.v1";
const NODE_KEY = "team38.node.v1";
const PERSON_KEY = "team38.person.v1";
const PROFILES_KEY = "team38.profiles.v1";
// Same key as /grafo's "Soy": checking in as someone makes the other views open as them.
export const ME_KEY = "team38.me";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Private mode or blocked storage: this visit still works from memory.
  }
}

function parse<T>(raw: string | null, schema: z.ZodType<T>, fallback: T): T {
  try {
    return raw ? schema.catch(fallback).parse(JSON.parse(raw)) : fallback;
  } catch {
    return fallback;
  }
}

// A value in localStorage that components can subscribe to. The parsed value is cached by its raw
// text because useSyncExternalStore needs the same reference while nothing changed.
function stored<T>(key: string, schema: z.ZodType<T>, empty: T) {
  let cached: { raw: string | null; value: T } = { raw: null, value: empty };
  const get = () => {
    const raw = read(key);
    if (raw !== cached.raw) cached = { raw, value: parse(raw, schema, empty) };
    return cached.value;
  };
  const set = (value: T) => {
    const raw = JSON.stringify(value);
    cached = { raw, value };
    write(key, raw);
    window.dispatchEvent(new Event(key));
  };
  const subscribe = (onChange: () => void) => {
    window.addEventListener(key, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(key, onChange);
      window.removeEventListener("storage", onChange);
    };
  };
  return { get, set, use: () => useSyncExternalStore(subscribe, get, () => empty) };
}

const signalStore = stored<Signal[]>(SIGNALS_KEY, z.array(SignalSchema), []);
const readSignals = signalStore.get;
export const writeSignals = signalStore.set;
export const useSignals = signalStore.use;

const keyOf = (signal: Pick<Signal, "source" | "kind" | "label">) => `${signal.source}:${signal.kind}:${signal.label}`;

export function addSignals(arrived: SynthesisSignal[]) {
  const merged = new Map(readSignals().map((signal) => [keyOf(signal), signal]));
  for (const signal of arrived) merged.set(keyOf(signal), { ...signal, evidence: "" });
  writeSignals([...merged.values()]);
}

// The detailed profile each assistant wrote, already through the privacy filter. One per assistant.
const ProfileSchema = z.object({ source: SourceSchema, markdown: z.string() });
export const ProfilesSchema = z.array(ProfileSchema);
export type Profile = z.infer<typeof ProfileSchema>;

const profileStore = stored<Profile[]>(PROFILES_KEY, ProfilesSchema, []);
export const useProfiles = profileStore.use;

export function addProfiles(arrived: Profile[]) {
  const bySource = new Map(profileStore.get().map((profile) => [profile.source, profile]));
  for (const profile of arrived) bySource.set(profile.source, profile);
  profileStore.set([...bySource.values()]);
}

// Taking a line out needs no review: the owner can only make the profile say less.
export function removeProfileLine(source: Profile["source"], index: number) {
  profileStore.set(
    profileStore
      .get()
      .map((profile) => (profile.source === source ? { ...profile, markdown: profile.markdown.split("\n").filter((_, i) => i !== index).join("\n") } : profile))
      .filter((profile) => profile.markdown.trim() !== ""),
  );
}

const PersonSchema = z.object({ personId: z.string().min(1).max(80), displayName: z.string().max(40) });
export type Person = z.infer<typeof PersonSchema>;

// Only rendered on the client (page.tsx loads the flow with ssr: false), so reading storage in the
// initializer is safe.
export function usePerson(): [Person, (person: Person) => void] {
  const [person, setPerson] = useState<Person>(() => {
    const stored = parse(read(PERSON_KEY), PersonSchema.nullable(), null);
    if (stored) return stored;
    const fresh = { personId: `p-${crypto.randomUUID().slice(0, 8)}`, displayName: "" };
    write(PERSON_KEY, JSON.stringify(fresh));
    return fresh;
  });
  return [
    person,
    (next) => {
      write(PERSON_KEY, JSON.stringify(next));
      setPerson(next);
    },
  ];
}

export function useStoredNode(): [PersonalNode | undefined, (node: PersonalNode | undefined) => void] {
  const [node, setNode] = useState<PersonalNode | undefined>(() => parse(read(NODE_KEY), PersonalNodeSchema.optional(), undefined));
  return [
    node,
    (next) => {
      write(NODE_KEY, next ? JSON.stringify(next) : null);
      setNode(next);
    },
  ];
}

export function rememberMe(personId: string) {
  write(ME_KEY, personId);
}
