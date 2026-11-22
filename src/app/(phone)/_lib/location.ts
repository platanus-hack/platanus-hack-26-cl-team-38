"use client";

import { useCallback, useEffect, useState } from "react";
import { COPY } from "./copy";
import { getPhone, logOutbox, setPhone } from "./store";

// Where you are, as a place name. Opt-in: the browser asks for permission the first time.
// The position goes rounded to ~100 m to our server, which asks OpenStreetMap for the name;
// the phone keeps only the name.

const REFRESH_MS = 10 * 60_000;

type Status = "idle" | "locating" | "denied" | "error";

export function useLocation() {
  const [status, setStatus] = useState<Status>("idle");

  const locate = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setStatus("error");
      return;
    }
    setStatus("locating");
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          const lat = coords.latitude.toFixed(3);
          const lon = coords.longitude.toFixed(3);
          const response = await fetch(`/api/place?lat=${lat}&lon=${lon}`);
          if (!response.ok) throw new Error();
          const { label } = (await response.json()) as { label: string };
          const first = !getPhone().locationOn;
          setPhone({ locationOn: true, place: { label, at: new Date().toISOString() } });
          if (first) logOutbox(COPY.outbox.map, COPY.outbox.location);
          setStatus("idle");
        } catch {
          setStatus("error");
        }
      },
      (e) => setStatus(e.code === e.PERMISSION_DENIED ? "denied" : "error"),
      { enableHighAccuracy: false, maximumAge: REFRESH_MS, timeout: 15_000 },
    );
  }, []);

  // Already on: refresh the place name when it is stale.
  useEffect(() => {
    const s = getPhone();
    if (!s.locationOn) return;
    if (s.place && Date.now() - new Date(s.place.at).getTime() < REFRESH_MS) return;
    const id = setTimeout(locate, 0);
    return () => clearTimeout(id);
  }, [locate]);

  const turnOff = useCallback(() => setPhone({ locationOn: false, place: null }), []);

  return { status, locate, turnOff };
}
