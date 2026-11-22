"use client";

import { useEffect, useState } from "react";
import { Splash } from "../_components/chrome";
import { LargeTitle, Mono } from "../_components/ui";
import { api } from "../_lib/api";
import { COPY } from "../_lib/copy";
import { usePhone } from "../_lib/store";

const C = COPY.conectar;

// The phone's half of the OAuth connector: a code that ties the assistant to this phone. Whatever
// the assistant delivers afterwards lands in this phone's inbox (see ConnectorInbox).
type Ticket = { code: string; expiresAt: number };

async function fetchCode(): Promise<Ticket | null> {
  const response = await api("/api/oauth/code", { method: "POST" }).catch(() => null);
  const body = (await response?.json().catch(() => null)) as Partial<Ticket> | null;
  return body?.code && body.expiresAt ? { code: body.code, expiresAt: body.expiresAt } : null;
}

export default function ConectarPage() {
  const s = usePhone();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // Set with each ticket and on a tick: reading the clock while rendering breaks the prerender.
  const [now, setNow] = useState(0);

  useEffect(() => {
    let live = true;
    void fetchCode().then((fresh) => {
      if (!live) return;
      setNow(Date.now());
      setTicket(fresh);
      setError(!fresh);
    });
    return () => {
      live = false;
    };
  }, [attempt]);

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(tick);
  }, []);

  if (!s) return <Splash />;
  const left = ticket ? Math.ceil((ticket.expiresAt - now) / 60_000) : 0;

  return (
    <div className="app">
      <LargeTitle title={C.title} back={s.onboarded ? "/perfil" : "/bienvenida"} />
      <div className="content">
        <p className="mute">{C.hint}</p>
        <div style={{ textAlign: "center", margin: "32px 0 8px" }}>
          {ticket && left > 0 ? (
            <Mono className="t-hero">{ticket.code}</Mono>
          ) : (
            <span className="mute" role="status">
              {error ? C.failed : ticket ? C.expired : C.loading}
            </span>
          )}
        </div>
        {ticket && left > 0 && (
          <p className="mute" style={{ textAlign: "center" }}>
            <Mono>{C.expires(left)}</Mono>
          </p>
        )}
        <button className="btn ghost" style={{ marginTop: 24 }} onClick={() => (setError(false), setTicket(null), setAttempt((n) => n + 1))}>
          {C.again}
        </button>
        <p className="mute" style={{ marginTop: 32 }}>
          {C.then}
        </p>
        <details className="mute" style={{ marginTop: 16 }}>
          <summary>{C.setupTitle}</summary>
          <p style={{ marginTop: 8 }}>{C.setup(`${window.location.origin}/api/mcp`)}</p>
        </details>
      </div>
    </div>
  );
}
