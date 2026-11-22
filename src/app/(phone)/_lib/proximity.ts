"use client";

import { useEffect, useSyncExternalStore } from "react";
import { createReporter, type LatLon } from "@/lib/proximity/reporter";
import { type ProximityNeighbor, type ProximityUpdate, ProximityUpdateSchema } from "@/lib/types";
import { api } from "./api";
import { clampRadius, DEMO, type Encounter, isVisible, nearby, useEncounters } from "./people";
import { COPY } from "./copy";
import { getPhone, logOutbox, type PhoneState } from "./store";

// Who is within your Distancia right now, from the proximity engine (src/lib/proximity/): this
// phone reports its GPS to POST /api/proximity and hears distances back over SSE, never anyone's
// coordinates. One connection per phone, shared by every screen that asks, and only while you
// are Visible, have Ubicación on and checked in to a room.

export type ProximityStatus = "off" | "connecting" | "on" | "denied" | "error";
type Proximity = { status: ProximityStatus; near: ReadonlyMap<string, ProximityNeighbor> };

const OFF: Proximity = { status: "off", near: new Map() };
let snapshot: Proximity = OFF;
const listeners = new Set<() => void>();
const set = (next: Partial<Proximity>) => {
  snapshot = { ...snapshot, ...next };
  for (const l of listeners) l();
};

const post = (body: object) =>
  fetch("/api/proximity", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    keepalive: true,
  });

type Connection = { key: string; users: number; setRadius: (m: number) => void; stop: () => void };
let current: Connection | null = null;
let logged = false;

function connect(personId: string, roomId: string, radius: number): Connection {
  let stopped = false;
  let session: string | null = null;
  let events: EventSource | null = null;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let report = createReporter();
  let stamp = 0;
  let last: { reading: LatLon; accuracy: number } | null = null;

  const apply = (update: ProximityUpdate) => {
    const near = new Map(snapshot.near);
    for (const n of [...update.enter, ...update.move]) near.set(n.personId, n);
    for (const id of update.leave) near.delete(id);
    set({ near, status: "on" });
  };

  const rejoin = (delay: number) => {
    events?.close();
    events = null;
    session = null;
    clearTimeout(retry);
    if (!stopped) retry = setTimeout(join, delay);
  };

  const deliver = (body: object) =>
    void post(body)
      .then((r) => r.status === 404 && rejoin(1000))
      .catch(() => {});

  const send = (reading: LatLon | null, accuracy: number) => {
    if (!session) return;
    const out = report(reading, accuracy, performance.now());
    if (out === "heartbeat") deliver({ action: "heartbeat", session });
    else if (out)
      deliver({ action: "report", session, position: { lat: out[0], lon: out[1], accuracy, stamp: ++stamp } });
  };

  async function join() {
    set({ status: snapshot.status === "denied" ? "denied" : "connecting", near: new Map() });
    const reply = await api("/api/proximity", {
      method: "POST",
      body: JSON.stringify({ action: "join", personId, roomId, radius }),
    })
      .then(async (r) => (r.ok ? ((await r.json()) as { session: string }) : null))
      .catch(() => null);
    if (stopped) {
      if (reply) void post({ action: "leave", session: reply.session });
      return;
    }
    if (!reply) {
      if (snapshot.status !== "denied") set({ status: "error" });
      return rejoin(15_000);
    }
    session = reply.session;
    if (!logged) logOutbox(COPY.outbox.server, COPY.outbox.proximity);
    logged = true;
    // The server forgot any earlier position: the filter starts over too, from the last reading.
    report = createReporter();
    events = new EventSource(`/api/proximity?session=${encodeURIComponent(session)}`);
    // On every (re)connection the server sends everyone in range again as "enter".
    events.onopen = () => set({ near: new Map() });
    events.onmessage = (e) => {
      const update = ProximityUpdateSchema.safeParse(JSON.parse(e.data));
      if (update.success) apply(update.data);
    };
    // A closed stream means the session is gone (server restart, expired); a dropped one reconnects by itself.
    events.onerror = () => events?.readyState === EventSource.CLOSED && rejoin(2000);
    if (snapshot.status !== "denied") set({ status: "on" });
    if (last) send(last.reading, last.accuracy);
  }

  const watch =
    "geolocation" in navigator
      ? navigator.geolocation.watchPosition(
          ({ coords }) => {
            last = { reading: [coords.latitude, coords.longitude], accuracy: coords.accuracy };
            if (snapshot.status === "denied") set({ status: session ? "on" : "connecting" });
            send(last.reading, last.accuracy);
          },
          (e) => e.code === e.PERMISSION_DENIED && set({ status: "denied" }),
          { enableHighAccuracy: true, maximumAge: 5_000, timeout: 30_000 },
        )
      : null;
  if (watch === null) set({ status: "denied" });
  // Standing still, the GPS goes quiet but the server still needs to hear that this phone is here.
  const tick = setInterval(
    () => (last ? send(null, last.accuracy) : session && deliver({ action: "heartbeat", session })),
    10_000,
  );
  const onHide = () =>
    session &&
    navigator.sendBeacon?.(
      "/api/proximity",
      new Blob([JSON.stringify({ action: "leave", session })], { type: "application/json" }),
    );
  window.addEventListener("pagehide", onHide);
  void join();

  return {
    key: `${personId}\n${roomId}`,
    users: 0,
    setRadius(m) {
      if (m === radius) return;
      radius = m;
      if (session) deliver({ action: "radius", session, radius: m });
    },
    stop() {
      stopped = true;
      clearTimeout(retry);
      clearInterval(tick);
      if (watch !== null) navigator.geolocation.clearWatch(watch);
      window.removeEventListener("pagehide", onHide);
      events?.close();
      if (session) void post({ action: "leave", session }).catch(() => {});
      set(OFF);
    },
  };
}

function acquire(personId: string, roomId: string, radius: number): () => void {
  const key = `${personId}\n${roomId}`;
  if (current && current.key !== key) {
    current.stop();
    current = null;
  }
  current ??= connect(personId, roomId, radius);
  const mine = current;
  mine.users++;
  return () => {
    // Let a screen that mounts right after (phone → desktop panel, a re-render) keep the connection.
    setTimeout(() => {
      if (--mine.users > 0 || current !== mine) return;
      mine.stop();
      current = null;
    }, 1000);
  };
}

/** Who is in range now, or `off` when proximity does not apply (demo mode, not Visible, no Ubicación, no room). */
function useProximity(s: PhoneState | null | undefined): Proximity {
  const personId = s?.personId;
  const roomId = s?.room?.id;
  const on = !!s && !DEMO && !!roomId && s.locationOn && isVisible(s);
  const radius = clampRadius(s?.radiusM ?? 0);
  useEffect(() => {
    if (!on || !personId || !roomId) return;
    // The radius changes in place (below), without reconnecting.
    return acquire(personId, roomId, clampRadius(getPhone().radiusM));
  }, [on, personId, roomId]);
  useEffect(() => {
    if (!on) return;
    const id = setTimeout(() => current?.setRadius(radius), 300);
    return () => clearTimeout(id);
  }, [on, radius]);
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => (on ? snapshot : OFF),
    () => OFF,
  );
}

/** Explorar's people: the sample encounters in demo mode; with a backend, only who proximity has in range. */
export function useNearby(s: PhoneState | null | undefined): {
  encounters: Encounter[] | undefined;
  status: ProximityStatus;
} {
  const encounters = useEncounters();
  const { status, near } = useProximity(s);
  return { encounters: encounters && (DEMO ? encounters : nearby(encounters, near)), status };
}
