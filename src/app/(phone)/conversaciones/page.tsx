"use client";

import Link from "next/link";
import { Splash, TabBar, useOnboardedPhone } from "../_components/chrome";
import { Initiatives } from "../_components/initiatives";
import { Requests } from "../_components/requests";
import { LargeTitle } from "../_components/ui";
import { COPY } from "../_lib/copy";
import { useEncounters } from "../_lib/people";

const C = COPY.conversaciones;

export default function ConversacionesPage() {
  const s = useOnboardedPhone();
  const encounters = useEncounters();
  if (!s) return <Splash />;

  return (
    <div className="app with-tabs">
      <LargeTitle title={C.title} />
      <div className="content">
        <Requests s={s} encounters={encounters} />
        <Initiatives
          s={s}
          encounters={encounters}
          head={
            <div className="sec u" style={{ marginTop: 8 }}>
              {C.initiatives}
            </div>
          }
          empty={
            <div className="empty-state">
              <p className="mute">{C.empty}</p>
              <p className="mute">{C.startOne}</p>
              <Link href="/" className="btn">
                {C.startCta}
              </Link>
            </div>
          }
        />
      </div>
      <TabBar />
    </div>
  );
}
