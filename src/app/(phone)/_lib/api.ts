"use client";

import { z } from "zod";
import { checkInBody, setShared } from "@/lib/node/node";
import { COPY } from "./copy";
import { DEMO } from "./people";
import { getPhone, logOutbox, setPhone } from "./store";

// The phone's side of the backend: every call goes as this phone (its device key), and the
// check-in is what makes you a user the other routes know (users, matches, connections, logs).

/** The event's room: Minga doesn't ask for a code, a `?sala=` link can change it. */
export const DEFAULT_ROOM = "HACK26";

const C = COPY.sala;

/** fetch to our own API, proving who you are with the device key. */
export function api(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${getPhone().deviceKey}`);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  return fetch(path, { ...init, headers });
}

const CheckInResponseSchema = z.object({
  roomId: z.string(),
  accepted: z.array(z.string()),
  rejected: z.array(z.object({ topicId: z.string(), reason: z.string() })),
});

export type CheckInResult = { ok: true; shared: number; rejected: number } | { ok: false; error: string };

/**
 * Publishes your public Intereses in the room. The server classifies them again and can disagree:
 * what it rejects goes back to private here too. The first time, it also claims your personId for
 * this phone's key. In demo mode there is no backend and nothing leaves the phone.
 */
export async function checkIn(roomCode = getPhone().room?.code ?? DEFAULT_ROOM, { quiet = false } = {}): Promise<CheckInResult> {
  const s = getPhone();
  if (!s.node) return { ok: false, error: C.noNode };
  if (!s.displayName.trim()) return { ok: false, error: C.noName };
  if (DEMO) return { ok: true, shared: 0, rejected: 0 };

  let body: ReturnType<typeof checkInBody>;
  try {
    body = checkInBody({ ...s.node, displayName: s.displayName.trim() }, roomCode);
  } catch {
    return { ok: false, error: C.badName };
  }
  try {
    const response = await api("/api/checkin", { method: "POST", body: JSON.stringify(body) });
    const json: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const message = z.object({ error: z.string() }).safeParse(json);
      return { ok: false, error: message.success ? `${C.failed}: ${message.data.error}` : `${C.failed}.` };
    }
    const result = CheckInResponseSchema.parse(json);
    setPhone((p) => ({
      room: { code: roomCode, id: result.roomId, at: new Date().toISOString() },
      node: p.node && result.rejected.reduce((n, r) => setShared(n, r.topicId, false), p.node),
    }));
    if (!quiet) logOutbox(COPY.outbox.server, COPY.outbox.published(result.accepted.length));
    return { ok: true, shared: result.accepted.length, rejected: result.rejected.length };
  } catch {
    return { ok: false, error: `${C.failed}. ${C.retry}` };
  }
}

let pending: ReturnType<typeof setTimeout> | undefined;

/** After you change what you publish: the room catches up a moment later, once per burst of edits. */
export function scheduleCheckIn() {
  if (DEMO || !getPhone().room) return;
  clearTimeout(pending);
  pending = setTimeout(() => void checkIn(undefined, { quiet: true }), 1500);
}
