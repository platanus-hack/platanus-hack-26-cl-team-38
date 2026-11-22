"use client";

import { useEffect } from "react";
import { AffinityGraph } from "../_components/affinity-graph";
import { BrandBar } from "../_components/brand-bar";
import { Splash, TabBar, useOnboardedPhone } from "../_components/chrome";
import { CoincidenceSheet } from "../_components/coincidence-sheet";
import { setFocus } from "../_components/match-graph";
import { NearFilters } from "../_components/near-filters";
import { RotatingLine } from "../_components/rotating-line";
import { Mono } from "../_components/ui";
import { COPY } from "../_lib/copy";
import { useLocation } from "../_lib/location";
import { clampRadius, coincidences, DEMO, fmtMeters, isVisible, myInterests, RANGE } from "../_lib/people";
import { networkInsights } from "../_lib/network-insights";
import { useContacts } from "../_lib/plans";
import { PROXIMITY, type ProximityStatus, useNearby } from "../_lib/proximity";
import { setPhone } from "../_lib/store";

const C = COPY.coincidencias;

export default function CoincidenciasPage() {
  const s = useOnboardedPhone();
  const { encounters, status } = useNearby(s);
  const location = useLocation();
  const contacts = useContacts(s);
  // Inicio shares the focus: what was open there should not open here.
  useEffect(() => setFocus({ topic: null, person: null }), []);
  if (!s) return <Splash />;

  const visible = isVisible(s);
  const radius = clampRadius(s.radiusM);
  const coins = encounters && visible ? coincidences(s, encounters) : [];
  const insights = networkInsights({
    mine: myInterests(s),
    coins,
    near: (encounters ?? []).filter((e) => e.person.personId !== s.personId && (e.inRange || e.distanceM <= radius)),
    contactIds: new Set((contacts ?? []).map((c) => c.person.personId)),
  });
  const setVisible = (on: boolean) => setPhone({ privacy: { ...s.privacy, discoverable: on } });

  return (
    <div className="app with-tabs">
      <div className="graph-screen stone">
        <BrandBar contacts={contacts} />
        <div className="head">
          <h1 className="t-hero explore-title">{C.heading}</h1>
          <div className="near-row">
            <Mono className="mute">
              {visible ? fmtMeters(radius) : "—"}
              {DEMO && !s.locationOn ? ` · ${C.demoShort}` : ""}
            </Mono>
            <NearFilters s={s} id="explore-filters" />
          </div>
        </div>
        {encounters === undefined ? (
          <div className="empty">{C.loading}</div>
        ) : !visible ? (
          <div className="empty">
            <div className="empty-state">
              <p>{C.invisible}</p>
              <button type="button" className="btn light" onClick={() => setVisible(true)}>
                {C.turnVisible}
              </button>
            </div>
          </div>
        ) : !DEMO && PROXIMITY && status !== "on" ? (
          <NotNear status={status} s={{ located: s.locationOn, room: !!s.room }} location={location} />
        ) : coins.length === 0 ? (
          <div className="empty">
            <div className="empty-state">
              <p>{C.nobody(radius)}</p>
              {radius < RANGE.max && <p className="mute">{C.widenHint}</p>}
            </div>
          </div>
        ) : (
          <>
            <div className="gwrap">
              <AffinityGraph W={360} H={400} me={{ id: s.personId }} contacts={coins} focus={s.focus.person} />
            </div>
            {insights.length > 0 && (
              <section className="net-insights" aria-label={C.insights.label}>
                <Mono className="mute">{C.insights.label}</Mono>
                <RotatingLine lines={insights} every={5000} className="wrap" />
              </section>
            )}
          </>
        )}
      </div>

      <CoincidenceSheet s={s} coins={coins} />
      <TabBar />
    </div>
  );
}

/** Why proximity is not running yet, and the one thing that turns it on. */
function NotNear({
  status,
  s,
  location,
}: {
  status: ProximityStatus;
  s: { located: boolean; room: boolean };
  location: ReturnType<typeof useLocation>;
}) {
  if (status === "connecting") return <div className="empty">{C.loading}</div>;
  const message = !s.room
    ? C.noRoom
    : !s.located
      ? C.needLocation
      : status === "denied" || location.status === "denied"
        ? C.locationDenied
        : C.proximityFailed;
  return (
    <div className="empty">
      <div className="empty-state">
        <p>{message}</p>
        {s.room && !s.located && (
          <button
            type="button"
            className="btn light"
            disabled={location.status === "locating"}
            onClick={location.locate}
          >
            {C.turnLocation}
          </button>
        )}
      </div>
    </div>
  );
}
