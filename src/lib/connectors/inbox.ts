import type { SynthesisSignal } from "@/lib/types";
import { TOKEN_MINUTES } from "./assistant";

// Where signals wait between the assistant and the phone. The token (inside the copied message)
// can only write; the inbox id (kept by the phone) can only read. Reading empties the inbox, so
// nothing personal stays on the server once the phone has it.
// shortcut: one process, in memory (Render runs a single always-on instance). With more than one
// instance this has to move to a shared store.
const GRACE_MS = 5 * 60_000; // the phone may still collect a little after the token expires

export type OpenInbox = { token: string; inbox: string; expiresAt: number };

export function createInboxStore(ttlMs = TOKEN_MINUTES * 60_000) {
  const tokens = new Map<string, { inbox: string; expiresAt: number }>();
  const inboxes = new Map<string, { signals: Map<string, SynthesisSignal>; expiresAt: number }>();
  const secret = () => crypto.randomUUID().replaceAll("-", "");

  function sweep(now: number) {
    for (const [token, entry] of tokens) if (now > entry.expiresAt) tokens.delete(token);
    for (const [id, entry] of inboxes) if (now > entry.expiresAt) inboxes.delete(id);
  }

  return {
    open(now = Date.now()): OpenInbox {
      sweep(now);
      const token = secret();
      const inbox = secret();
      const expiresAt = now + ttlMs;
      tokens.set(token, { inbox, expiresAt });
      inboxes.set(inbox, { signals: new Map(), expiresAt: expiresAt + GRACE_MS });
      return { token, inbox, expiresAt };
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

    // null: the inbox does not exist or expired, and the phone should ask for a new message.
    drain(id: string, now = Date.now()): SynthesisSignal[] | null {
      const inbox = inboxes.get(id);
      if (!inbox || now > inbox.expiresAt) return null;
      const signals = [...inbox.signals.values()];
      inbox.signals.clear();
      return signals;
    },
  };
}

export type InboxStore = ReturnType<typeof createInboxStore>;
