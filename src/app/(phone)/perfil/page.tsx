"use client";

import { useRouter } from "next/navigation";
import { shareRecommended } from "@/lib/node/node";
import { useState } from "react";
import { MoreTopics } from "../_components/ai-card";
import { Avatar } from "../_components/avatar";
import { BrandLogo } from "../_components/brand";
import { Sheet, Splash, TabBar, useOnboardedPhone } from "../_components/chrome";
import { Icon } from "../_components/icons";
import { TopicItem } from "../_components/topic-item";
import { ListRow, Mono } from "../_components/ui";
import { COPY } from "../_lib/copy";
import { useLocation } from "../_lib/location";
import { DEMO, myInterests } from "../_lib/people";
import { connectedSources, resetPhone, setPhone, signOut } from "../_lib/store";
import { toast } from "../_lib/toast";

const C = COPY.perfil;
const time = new Intl.DateTimeFormat("es-CL", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" });

export default function PerfilPage() {
  const s = useOnboardedPhone();
  const router = useRouter();
  const { status, locate, turnOff } = useLocation();
  const [outbox, setOutbox] = useState(false);
  const [config, setConfig] = useState(false);
  const [confirmWipe, setConfirmWipe] = useState(false);
  if (!s) return <Splash />;
  const interests = myInterests(s);
  const privacy = s.privacy ?? { visibility: "conocidos" as const, discoverable: true, showPlace: true };
  const setPrivacy = (patch: Partial<typeof privacy>) => {
    setPhone({ privacy: { ...privacy, ...patch } });
    toast(C.saved);
  };
  const topics = s.node?.topics ?? [];
  const kept = topics.length - interests.length;
  // "Lo recomendado": what the privacy filter found safe and you haven't decided on yet.
  const recommended = topics.filter((t) => t.privacy?.level === "segura" && t.privacy.decidedBy === "default").length;

  function leave() {
    signOut();
    router.replace("/bienvenida");
  }

  function wipe() {
    setConfirmWipe(false);
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
        {interests.length ? <MoreTopics topics={interests} limit={10} /> : <p className="mute">{C.noInterests}</p>}

        <div className="sec u">{C.sources}</div>
        <div className="logos" aria-label={C.sources}>
          {connectedSources(s).map((src) => (
            <BrandLogo key={src} source={src} />
          ))}
        </div>

        <div className="sec u">
          {C.privacy}
          <Mono className="mute">
            {interests.length} {COPY.nodo.shared} · {kept} {COPY.nodo.kept}
          </Mono>
        </div>
        <p className="mute" style={{ margin: 0, fontSize: 13 }}>
          {C.privacyHelp}
        </p>
        <div className="rows">
          {topics.slice(0, 4).map((t) => (
            <TopicItem key={t.id} topic={t} />
          ))}
        </div>
        <button type="button" className="btn ghost" style={{ marginTop: 16 }} onClick={() => setConfig(true)}>
          <Icon name="shield" />
          {C.configure}
          {topics.length > 4 && <Mono className="mute">+{topics.length - 4}</Mono>}
        </button>

        <div className="sec u">{C.account}</div>
        <div className="rows">
          <ListRow title={C.outbox} data={s.outbox.length} onClick={() => setOutbox(true)} chevron />
          <ListRow title={C.myNode} data={`${interests.length} · ${kept}`} href="/nodo" chevron />
          <ListRow title={COPY.conectar.row} href="/conectar" chevron />
          <ListRow title={C.signOut} onClick={leave} />
          <ListRow title={C.wipe} onClick={() => setConfirmWipe(true)} className="danger" />
        </div>
        {DEMO && (
          <p className="mute" style={{ fontSize: 13, textAlign: "center", marginTop: 24 }}>
            Demo · seed
          </p>
        )}
      </div>

      <Sheet open={config} size="detail" onClose={() => setConfig(false)} label={C.privacy}>
        <h2 className="t-title">{C.privacy}</h2>
        <div className="sec">
          {C.byTopic}
          <Mono className="mute">
            {interests.length} {COPY.nodo.shared} · {kept} {COPY.nodo.kept}
          </Mono>
        </div>
        {recommended > 0 && (
          <button type="button" className="link" onClick={() => setPhone((p) => (p.node ? { node: shareRecommended(p.node) } : {}))}>
            {COPY.bienvenida.shareAll}
          </button>
        )}
        <div className="rows">
          {topics.map((t) => (
            <TopicItem key={t.id} topic={t} />
          ))}
        </div>

        <div className="sec">{C.general}</div>
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
        </div>
      </Sheet>

      <Sheet open={confirmWipe} size="auto" onClose={() => setConfirmWipe(false)} label={C.wipeTitle}>
        <div className="confirm">
          <span className="confirm-ic">
            <Icon name="trash" />
          </span>
          <h2 className="t-title">{C.wipeTitle}</h2>
          <p className="mute">{C.wipeText}</p>
          <button type="button" className="btn danger" onClick={wipe}>
            {C.wipeYes}
          </button>
          <button type="button" className="btn ghost" onClick={() => setConfirmWipe(false)}>
            {C.cancel}
          </button>
        </div>
      </Sheet>

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
