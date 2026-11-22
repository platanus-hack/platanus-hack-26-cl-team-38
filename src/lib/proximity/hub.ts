import { ProximityJoinSchema, ProximityReportSchema, type ProximityUpdate } from "@/lib/types";
import { createProximityEngine, type EngineOptions, type ProximityEngine, type ProximityEvent } from "./engine";

// One proximity engine per room, plus the sessions of the phones connected to it. Transport-free:
// a route (SSE, polling, WebSocket in another process) only has to call join, report, listen and
// leave. Positions live only in the engine's memory and expire on their own; nothing here logs
// or stores them, and listeners get distance and bearing, never coordinates.
// shortcut: one process, in memory, like the onboarding inbox. Not for more than one instance.

export type HubOptions = {
  engine?: EngineOptions;
  maxPeoplePerRoom?: number;
  /** A session with no report or heartbeat for this long is closed, listener or not. */
  sessionTtlMs?: number;
  now?: () => number;
};

type Session = { roomId: string; personId: string; displayName: string; anchor: number; lastSeenAt: number; send: ((update: ProximityUpdate) => void) | null };

function toUpdate(events: ProximityEvent<string>[], anchor: number): ProximityUpdate {
  const update: ProximityUpdate = { anchor, enter: [], move: [], leave: [] };
  for (const event of events) {
    if (event.type === "leave") update.leave.push(event.id);
    else update[event.type].push({ personId: event.id, displayName: event.data, distance: Math.round(event.distance), bearing: Math.round(event.bearing) % 360, uncertainty: Math.round(event.uncertainty) });
  }
  return update;
}

export function createProximityHub({ engine: engineOptions, maxPeoplePerRoom = 300, sessionTtlMs = 5 * 60_000, now = Date.now }: HubOptions = {}) {
  const rooms = new Map<string, ProximityEngine<string>>();
  const sessions = new Map<string, Session>();
  const byPerson = new Map<string, string>();
  const personKey = (roomId: string, personId: string) => `${roomId}\n${personId}`;

  function close(key: string) {
    const session = sessions.get(key);
    if (!session) return;
    sessions.delete(key);
    byPerson.delete(personKey(session.roomId, session.personId));
    const room = rooms.get(session.roomId);
    room?.leave(session.personId);
    if (room?.size === 0) rooms.delete(session.roomId);
  }

  return {
    /**
     * Opens a session and returns its secret, or null when the input is invalid or the room is
     * full. Whoever comes back (reload, reconnect) starts from zero: the old position and what
     * they saw are forgotten, so no distance is ever computed from a point the new page ignores.
     * The caller decides who may join a room: this does not check membership.
     */
    join(input: unknown): { session: string } | null {
      const parsed = ProximityJoinSchema.safeParse(input);
      if (!parsed.success) return null;
      const { roomId, personId, displayName, radius } = parsed.data;
      const previous = byPerson.get(personKey(roomId, personId));
      if (previous) close(previous);
      const room = rooms.get(roomId) ?? createProximityEngine<string>({ ...engineOptions, now });
      if (room.size >= maxPeoplePerRoom) return null;
      rooms.set(roomId, room);
      room.join(personId, { radius, data: displayName });
      const key = crypto.randomUUID().replaceAll("-", "");
      sessions.set(key, { roomId, personId, displayName, anchor: 0, lastSeenAt: now(), send: null });
      byPerson.set(personKey(roomId, personId), key);
      return { session: key };
    },

    /** A new position. False when the session is unknown or the report is invalid. */
    report(key: string, input: unknown): boolean {
      const session = sessions.get(key);
      const parsed = ProximityReportSchema.safeParse(input);
      if (!session || !parsed.success) return false;
      session.anchor = parsed.data.stamp;
      session.lastSeenAt = now();
      rooms.get(session.roomId)?.update(session.personId, parsed.data.lat, parsed.data.lon, parsed.data.accuracy);
      return true;
    },

    /** A new Distancia, keeping the session and the position: who is in range is recomputed now. */
    setRadius(key: string, radius: unknown): boolean {
      const session = sessions.get(key);
      const parsed = ProximityJoinSchema.shape.radius.safeParse(radius);
      if (!session || !parsed.success) return false;
      session.lastSeenAt = now();
      rooms.get(session.roomId)?.join(session.personId, { radius: parsed.data, data: session.displayName });
      return true;
    },

    /** "Still here, did not move". The phone sends one every 30 s when it has nothing to report. */
    heartbeat(key: string): boolean {
      const session = sessions.get(key);
      if (!session) return false;
      session.lastSeenAt = now();
      rooms.get(session.roomId)?.heartbeat(session.personId);
      return true;
    },

    /**
     * Starts delivering updates to `send`; everyone already in range arrives first as `enter`.
     * Returns how to stop, or null when the session is unknown. One listener per session.
     */
    listen(key: string, send: (update: ProximityUpdate) => void): (() => void) | null {
      const session = sessions.get(key);
      const room = session && rooms.get(session.roomId);
      if (!session || !room) return null;
      session.send = send;
      session.lastSeenAt = now();
      room.subscribe(session.personId, (events) => session.send?.(toUpdate(events, session.anchor)));
      return () => {
        if (session.send !== send) return;
        session.send = null;
        room.subscribe(session.personId, null);
      };
    },

    leave: close,

    /** Delivers what accumulated and forgets what expired. Call it about twice a second. */
    tick() {
      const idleLimit = now() - sessionTtlMs;
      for (const [key, session] of sessions) if (session.lastSeenAt < idleLimit) close(key);
      for (const room of rooms.values()) {
        room.sweep();
        room.flush();
      }
    },

    get rooms() {
      return rooms.size;
    },
    get sessions() {
      return sessions.size;
    },
  };
}

export type ProximityHub = ReturnType<typeof createProximityHub>;
