import type { Source, SynthesisSignal } from "@/lib/types";
import { TOKEN_MINUTES } from "./assistant";

// Where signals wait between the assistant and the phone. The token (inside the copied message)
// can only write; the inbox id (kept by the phone) can only read. Reading empties the inbox, so
// nothing personal stays on the server once the phone has it.
// shortcut: one process, in memory (Render runs a single always-on instance). With more than one
// instance this has to move to a shared store.
const GRACE_MS = 5 * 60_000; // the phone may still collect a little after the token expires
// A connected assistant delivers whenever the person asks, and the phone may be closed then.
const OWNER_TTL_MS = 24 * 60 * 60_000;
const ownerInbox = (owner: string) => `owner:${owner}`;

export type OpenInbox = { token: string; inbox: string; expiresAt: number };

export function createInboxStore(ttlMs = TOKEN_MINUTES * 60_000) {
  const tokens = new Map<string, { inbox: string; expiresAt: number }>();
  const inboxes = new Map<
    string,
    { signals: Map<string, SynthesisSignal>; profiles: Map<Source, string>; expiresAt: number }
  >();
  const secret = () => crypto.randomUUID().replaceAll("-", "");

  function sweep(now: number) {
    for (const [token, entry] of tokens) if (now > entry.expiresAt) tokens.delete(token);
    for (const [id, entry] of inboxes) if (now > entry.expiresAt) inboxes.delete(id);
  }

  // null: the inbox does not exist or expired, and the phone should ask for a new message.
  function drain(id: string, now = Date.now()): SynthesisSignal[] | null {
    const inbox = inboxes.get(id);
    if (!inbox || now > inbox.expiresAt) return null;
    const signals = [...inbox.signals.values()];
    inbox.signals.clear();
    return signals;
  }

  function drainProfiles(id: string, now = Date.now()): { source: Source; markdown: string }[] | null {
    const inbox = inboxes.get(id);
    if (!inbox || now > inbox.expiresAt) return null;
    const profiles = [...inbox.profiles].map(([source, markdown]) => ({ source, markdown }));
    inbox.profiles.clear();
    return profiles;
  }

  return {
    open(now = Date.now()): OpenInbox {
      sweep(now);
      const token = secret();
      const inbox = secret();
      const expiresAt = now + ttlMs;
      tokens.set(token, { inbox, expiresAt });
      inboxes.set(inbox, { signals: new Map(), profiles: new Map(), expiresAt: expiresAt + GRACE_MS });
      return { token, inbox, expiresAt };
    },

    // For the OAuth connector: a write token into the inbox of a phone (its device key's hash),
    // which lives as long as deliveries keep arriving. The phone drains it with drainOwner().
    openFor(owner: string, now = Date.now()): OpenInbox {
      sweep(now);
      const token = secret();
      const inbox = ownerInbox(owner);
      const expiresAt = now + ttlMs;
      tokens.set(token, { inbox, expiresAt });
      const existing = inboxes.get(inbox);
      if (existing) existing.expiresAt = Math.max(existing.expiresAt, now + OWNER_TTL_MS);
      else inboxes.set(inbox, { signals: new Map(), profiles: new Map(), expiresAt: now + OWNER_TTL_MS });
      return { token, inbox, expiresAt };
    },

    drainOwner(
      owner: string,
      now = Date.now(),
    ): { signals: SynthesisSignal[]; profiles: { source: Source; markdown: string }[] } {
      const id = ownerInbox(owner);
      return { signals: drain(id, now) ?? [], profiles: drainProfiles(id, now) ?? [] };
    },

    has(token: string, now = Date.now()): boolean {
      const entry = tokens.get(token);
      return entry !== undefined && now <= entry.expiresAt;
    },

    // The token works several times inside its window, so the same message can be pasted into a
    // chat and into Claude Code. A repeated signal keeps its strongest reading.
    deliver(token: string, signals: SynthesisSignal[], now = Date.now()): boolean {
      const entry = tokens.get(token);
      const inbox = entry && now <= entry.expiresAt ? inboxes.get(entry.inbox) : undefined;
      if (!inbox) return false;
      for (const signal of signals) {
        const key = `${signal.source}:${signal.kind}:${signal.label}`;
        const known = inbox.signals.get(key);
        if (!known || signal.strength > known.strength) inbox.signals.set(key, signal);
      }
      return true;
    },

    // One profile per assistant: uploading again replaces what that assistant sent before.
    deliverProfile(token: string, source: Source, markdown: string, now = Date.now()): boolean {
      const entry = tokens.get(token);
      const inbox = entry && now <= entry.expiresAt ? inboxes.get(entry.inbox) : undefined;
      if (!inbox) return false;
      inbox.profiles.set(source, markdown);
      return true;
    },

    drain,
    drainProfiles,
  };
}

export type InboxStore = ReturnType<typeof createInboxStore>;
