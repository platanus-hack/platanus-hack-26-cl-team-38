"use client";

import { useEffect, useMemo, useState } from "react";
import { draftsFromSignals, needsVerdict, reconcile, type DraftTopic } from "@/lib/node/node";
import { fetchVerdicts } from "@/lib/privacy/client";
import type { PersonalNode, TopicPrivacy } from "@/lib/types";
import { scheduleCheckIn } from "./api";
import { COPY } from "./copy";
import { getPhone, logOutbox, type PhoneState, setPhone } from "./store";

// The Nodo follows your signals, as in /onboarding: new topics get a verdict from the privacy
// filter (POST /api/privacy/classify), `sensible` ones never enter, and everything you already
// decided (public or private, your depth) is kept.

export type NodeSync = {
  /** Waiting for the filter. */
  reviewing: boolean;
  /** How many topics the filter left out in the last review. */
  held: number;
  error?: string;
  retry: () => void;
};

/** reconcile() takes depth from the signals; in Minga the depth you set by hand wins. */
function keepDepth(before: PersonalNode | null, next: PersonalNode): PersonalNode {
  const depth = new Map(before?.topics.map((t) => [t.id, t.depth]));
  return { ...next, topics: next.topics.map((t) => ({ ...t, depth: depth.get(t.id) ?? t.depth })) };
}

function apply(personId: string, drafts: DraftTopic[], fresh: { draft: DraftTopic; verdict: TopicPrivacy }[]) {
  const before = getPhone().node;
  const owner = { personId, displayName: getPhone().displayName || "Tú" };
  const next = keepDepth(before, reconcile(before ?? undefined, owner, drafts, fresh));
  if (fresh.length === 0 && JSON.stringify(next.topics) === JSON.stringify(before?.topics ?? [])) return;
  setPhone({ node: next });
  scheduleCheckIn();
}

const draftKey = (d: DraftTopic) => `${d.id}:${d.kind}:${d.name}`;

export function useNodeSync(s: PhoneState | undefined): NodeSync {
  const signals = s?.signals;
  const personId = s?.personId;
  const node = s?.node;
  const [attempt, setAttempt] = useState(0);
  // The outcome of the last review, tied to what it reviewed: "reviewing" is derived, not stored.
  const [result, setResult] = useState<{ key: string; held: number; error?: string; dropped: string[] }>({
    key: "",
    held: 0,
    dropped: [],
  });

  const drafts = useMemo(() => (signals && personId ? draftsFromSignals(personId, signals) : []), [signals, personId]);
  // What the filter called `sensible` never enters the node, so it would look unreviewed forever.
  const missing = useMemo(
    () => needsVerdict(node ?? undefined, drafts).filter((d) => !result.dropped.includes(draftKey(d))),
    [node, drafts, result.dropped],
  );
  const key = `${attempt}|${missing.map(draftKey).join(",")}`;

  useEffect(() => {
    if (!personId) return;
    if (missing.length === 0) return apply(personId, drafts, []);
    let cancelled = false;
    logOutbox(COPY.outbox.filter, COPY.outbox.filtered(missing.length));
    fetchVerdicts(missing)
      .then((verdicts) => {
        if (cancelled) return;
        apply(
          personId,
          drafts,
          missing.map((draft, i) => ({ draft, verdict: verdicts[i] })),
        );
        const dropped = missing.filter((_, i) => verdicts[i].level === "sensible").map(draftKey);
        setResult((r) => ({ key, held: dropped.length, dropped: [...r.dropped, ...dropped] }));
      })
      .catch(() => !cancelled && setResult((r) => ({ ...r, key, held: 0, error: COPY.bienvenida.filterDown })));
    return () => {
      cancelled = true;
    };
    // `key` names what is missing: a new node object with the same gaps must not ask again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, personId]);

  const settled = result.key === key;
  return {
    reviewing: missing.length > 0 && !settled,
    held: result.held,
    error: settled ? result.error : undefined,
    retry: () => setAttempt((n) => n + 1),
  };
}
