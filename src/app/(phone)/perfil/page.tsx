"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Avatar } from "../_components/avatar";
import { BrandLogo } from "../_components/brand";
import { Sheet, Splash, TabBar, useOnboardedPhone } from "../_components/chrome";
import { ListRow, Mono, Tags } from "../_components/ui";
import { COPY } from "../_lib/copy";
import { useLocation } from "../_lib/location";
import { cap, DEMO, myInterests } from "../_lib/people";
import { connectedSources, resetPhone, setPhone } from "../_lib/store";

const C = COPY.perfil;
const time = new Intl.DateTimeFormat("es-CL", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" });

export default function PerfilPage() {
  const s = useOnboardedPhone();
  const router = useRouter();
  const { status, locate, turnOff } = useLocation();
  const [outbox, setOutbox] = useState(false);
  if (!s) return <Splash />;
  const interests = myInterests(s);
  const privacy = s.privacy ?? { visibility: "conocidos" as const, discoverable: true, showPlace: true };
  const setPrivacy = (patch: Partial<typeof privacy>) => setPhone({ privacy: { ...privacy, ...patch } });
  const kept = (s.node?.topics.length ?? 0) - interests.length;

  function wipe() {
    if (!confirm(C.wipeConfirm)) return;
    resetPhone();
    router.replace("/bienvenida");
  }

  return (
    <div className="app with-tabs">
      <div className="content" style={{ paddingTop: 48 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
          <Avatar id={s.personId} className="lg-face" />
          <h1 className="t-title">{s.displayName}</h1>
        </div>

        <div className="sec u">{C.interests}</div>
        {interests.length ? <Tags topics={interests.map((t) => ({ ...t, name: cap(t.name) }))} /> : <p className="mute">{C.noInterests}</p>}

        <div className="sec u">{C.sources}</div>
        <div className="logos" aria-label={C.sources}>
          {connectedSources(s).map((src) => (
            <BrandLogo key={src} source={src} />
          ))}
        </div>

        <div className="sec u">{C.privacy}</div>
        <div className="t-data mute">{C.visibility}</div>
        <div className="segbar" role="radiogroup" aria-label={C.visibility}>
          {(["todos", "conocidos", "amigos"] as const).map((v) => (
            <button key={v} type="button" role="radio" aria-checked={privacy.visibility === v} onClick={() => setPrivacy({ visibility: v })}>
              {C.visibilityOptions[v]}
            </button>
          ))}
        </div>
        <div className="rows">
          <SwitchRow label={C.discoverable} on={privacy.discoverable} onChange={(v) => setPrivacy({ discoverable: v })} />
          <SwitchRow label={C.location} on={s.locationOn} busy={status === "locating"} onChange={(v) => (v ? locate() : turnOff())} />
          <SwitchRow label={C.showPlace} on={privacy.showPlace} onChange={(v) => setPrivacy({ showPlace: v })} />
          <ListRow title={C.outbox} data={s.outbox.length} onClick={() => setOutbox(true)} chevron />
        </div>

        <div className="sec u">{C.account}</div>
        <div className="rows">
          <ListRow title={C.myNode} data={`${interests.length} · ${kept}`} href="/nodo" chevron />
          <ListRow title={C.wipe} onClick={wipe} className="danger" />
        </div>
        {DEMO && (
          <p className="mute" style={{ fontSize: 13, textAlign: "center", marginTop: 24 }}>
            Demo · seed
          </p>
        )}
      </div>

      <Sheet open={outbox} size="list" onClose={() => setOutbox(false)} label={C.outbox}>
        <h2 className="t-title">{C.outbox}</h2>
        <div className="rows">
          {s.outbox.length === 0 ? (
            <p className="mute">{C.none}</p>
          ) : (
            s.outbox.map((o) => <ListRow key={o.at} title={o.to} sub={o.what} data={<Mono>{time.format(new Date(o.at))}</Mono>} />)
          )}
        </div>
      </Sheet>
      <TabBar />
    </div>
  );
}

function SwitchRow({ label, on, busy, onChange }: { label: string; on: boolean; busy?: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="row">
      <span className="main">{label}</span>
      <button type="button" role="switch" aria-checked={on} aria-label={label} aria-busy={busy} className="switch" onClick={() => onChange(!on)} />
    </div>
  );
}
