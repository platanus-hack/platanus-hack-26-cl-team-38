"use client";

import { useEffect, useState } from "react";
import { z } from "zod";
import { ConnectionSchema } from "@/lib/types";
import { api } from "./api";
import { COPY } from "./copy";
import { DEMO, type Encounter } from "./people";
import { getPhone, type PhoneState, setPhone } from "./store";
import { toast } from "./toast";

// Solicitudes: people who asked to be your Contacto and wait for your answer. With a backend
// they are the connections someone else proposed (GET /api/connections); accepting or rejecting
// is one POST. Demo mode has no backend: two people from the seed ask, and the answer stays here.

const C = COPY.solicitudes;
const DEMO_REQUESTS = 2;

export type Incoming = { personId: string; displayName: string; where: string; at: string };

function demoIncoming(s: PhoneState, encounters: Encounter[]): Incoming[] {
  return encounters
    .filter((e) => e.relation === "cercania" && e.person.personId !== s.personId)
    .slice(0, DEMO_REQUESTS)
    .filter((e) => !s.relations?.[e.person.personId] && !(s.dismissed ?? []).includes(e.person.personId))
    .map((e) => ({ personId: e.person.personId, displayName: e.person.displayName, where: e.place, at: e.at }));
}

/** The requests waiting for you, and how to answer one. Empty while loading. */
export function useIncoming(
  s: PhoneState | undefined,
  encounters: Encounter[] | undefined,
): { list: Incoming[]; answer: (r: Incoming, accept: boolean) => Promise<void> } {
  const [remote, setRemote] = useState<Incoming[]>([]);
  useEffect(() => {
    if (DEMO) return;
    let alive = true;
    api(`/api/connections?personId=${encodeURIComponent(getPhone().personId)}`)
      .then(async (r) =>
        r.ok ? z.object({ connections: z.array(ConnectionSchema) }).parse(await r.json()).connections : [],
      )
      .catch(() => [])
      .then((all) => {
        if (!alive) return;
        setRemote(
          all
            .filter((c) => c.status === "propuesta" && !c.proposedByMe)
            .map((c) => ({ personId: c.personId, displayName: c.displayName, where: c.origin.label, at: c.createdAt })),
        );
      });
    return () => {
      alive = false;
    };
  }, []);

  async function answer(r: Incoming, accept: boolean) {
    const done = () => toast(accept ? C.accepted(r.displayName) : C.rejected);
    if (DEMO) {
      // In demo an accepted request is a Conocido, which is what makes someone a Contacto there.
      setPhone((p) =>
        accept
          ? { relations: { ...p.relations, [r.personId]: "conocido" } }
          : { dismissed: [...(p.dismissed ?? []), r.personId] },
      );
      return done();
    }
    const ok = await api("/api/connections", {
      method: "POST",
      body: JSON.stringify({ personId: getPhone().personId, otherId: r.personId, action: accept ? "accept" : "close" }),
    })
      .then((res) => res.ok)
      .catch(() => false);
    if (!ok) return toast(C.failed);
    setRemote((list) => list.filter((x) => x.personId !== r.personId));
    done();
  }

  return { list: DEMO ? (s && encounters ? demoIncoming(s, encounters) : []) : remote, answer };
}
