"use client";

import { useEffect } from "react";
import { z } from "zod";
import { SynthesisSignalSchema } from "@/lib/types";
import { api } from "../_lib/api";
import { mergeSignals, usePhone } from "../_lib/store";
import { syncProfiles } from "../_lib/plans";
import { addProfiles, ProfilesSchema, useProfiles } from "../onboarding/store";

const EVERY_MS = 4000;

// A connected assistant (the MCP connector) delivers whenever the person asks it, not only during
// the onboarding, so the app collects from this phone's inbox while it is open and visible.
export function ConnectorInbox() {
  const profiles = useProfiles();
  const s = usePhone();
  const personId = s?.personId;
  const roomId = s?.room?.id;
  // Only once you are a user (checked in): before that the backend has nobody to file it under.
  useEffect(() => {
    if (!personId || !roomId) return;
    const soon = setTimeout(() => void syncProfiles(profiles), 1000);
    return () => clearTimeout(soon);
  }, [profiles, personId, roomId]);

  useEffect(() => {
    const poll = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      const response = await api("/api/onboarding/inbox/mine", { method: "POST" }).catch(() => null);
      if (!response?.ok) return;
      const body = (await response.json().catch(() => ({}))) as { signals?: unknown; profiles?: unknown };
      const signals = z.array(SynthesisSignalSchema).catch([]).parse(body.signals);
      if (signals.length > 0) mergeSignals(signals);
      const profiles = ProfilesSchema.catch([]).parse(body.profiles);
      if (profiles.length > 0) addProfiles(profiles);
    }, EVERY_MS);
    return () => clearInterval(poll);
  }, []);
  return null;
}
