"use client";

import Link from "next/link";
import { Splash, TabBar, useOnboardedPhone } from "../_components/chrome";
import { TopicItem } from "../_components/topic-item";
import { Mono, LargeTitle } from "../_components/ui";
import { COPY } from "../_lib/copy";
import { myInterests } from "../_lib/people";

const C = COPY.nodo;

export default function NodoPage() {
  const s = useOnboardedPhone();
  if (!s) return <Splash />;
  const topics = s.node?.topics ?? [];
  const shared = myInterests(s).length;

  return (
    <div className="app with-tabs">
      <LargeTitle
        title={C.title}
        back="/perfil"
        sub={
          <Mono className="mute">
            {shared} {C.shared} · {topics.length - shared} {C.kept}
          </Mono>
        }
      />
      <div className="content">
        <div className="rows">
          {topics.map((t) => (
            <TopicItem key={t.id} topic={t} editDepth />
          ))}
        </div>
        <Link href="/bienvenida" className="btn ghost" style={{ marginTop: 24 }}>
          {C.addSource}
        </Link>
      </div>
      <TabBar />
    </div>
  );
}
