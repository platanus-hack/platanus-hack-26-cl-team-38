"use client";

import { type CSSProperties, useEffect, useState } from "react";
import { AffinityGraph } from "../_components/affinity-graph";
import { Splash, TabBar, useOnboardedPhone } from "../_components/chrome";
import { CoincidenceSheet } from "../_components/coincidence-sheet";
import { Icon } from "../_components/icons";
import { setFocus } from "../_components/match-graph";
import { Mono } from "../_components/ui";
import { COPY } from "../_lib/copy";
import { useLocation } from "../_lib/location";
import { clampRadius, coincidences, DEMO, fmtMeters, isVisible, RANGE } from "../_lib/people";
import { type ProximityStatus, useNearby } from "../_lib/proximity";
import { setPhone } from "../_lib/store";

const C = COPY.coincidencias;

export default function CoincidenciasPage() {
  const s = useOnboardedPhone();
  const { encounters, status } = useNearby(s);
  const location = useLocation();
  const [filters, setFilters] = useState(false);
  // Inicio shares the focus: what was open there should not open here.
  useEffect(() => setFocus({ topic: null, person: null }), []);
  if (!s) return <Splash />;

  const visible = isVisible(s);
  const radius = clampRadius(s.radiusM);
  const coins = encounters && visible ? coincidences(s, encounters) : [];
  const setVisible = (on: boolean) => setPhone({ privacy: { ...s.privacy, discoverable: on } });

  return (
    <div className="app with-tabs">
      <div className="graph-screen">
        <div className="head">
          <h1 className="sr">{C.title}</h1>
          <div className="near-row">
            <Mono className="mute">
              {visible ? `${coins.length} · ${fmtMeters(radius)}` : "—"}
              {DEMO && !s.locationOn ? ` · ${C.demoShort}` : ""}
            </Mono>
            <button type="button" className="filter-btn" aria-expanded={filters} aria-controls="explore-filters" aria-label={C.filters} onClick={() => setFilters(!filters)}>
              <Icon name="filter" />
            </button>
          </div>
          {filters && (
            <div id="explore-filters" className="filters">
              <label className="near-switch">
                <span>{C.visible}</span>
                <button type="button" role="switch" aria-checked={visible} aria-label={C.visible} className="switch" onClick={() => setVisible(!visible)} />
              </label>
              {visible && (
                <label className="range">
                  <span className="sr">{C.range}</span>
                  <input
                    type="range"
                    min={RANGE.min}
                    max={RANGE.max}
                    step={RANGE.step}
                    value={radius}
                    aria-label={C.range}
                    aria-valuetext={`${radius} metros`}
                    style={{ "--fill": `${((radius - RANGE.min) / (RANGE.max - RANGE.min)) * 100}%` } as CSSProperties}
                    onChange={(e) => setPhone({ radiusM: Number(e.target.value) })}
                  />
                  <Mono>{radius} m</Mono>
                </label>
              )}
            </div>
          )}
          {visible && <p className="range-note">{C.rangeNote}</p>}
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
        ) : !DEMO && status !== "on" ? (
          <NotNear status={status} s={{ located: s.locationOn, room: !!s.room }} location={location} />
        ) : coins.length === 0 ? (
          <div className="empty">
            <div className="empty-state">
              <p>{C.nobody(radius)}</p>
              {radius < RANGE.max && <p className="mute">{C.widenHint}</p>}
            </div>
          </div>
        ) : (
          <div className="gwrap">
            <AffinityGraph W={360} H={400} me={{ id: s.personId }} contacts={coins} focus={s.focus.person} />
          </div>
        )}
      </div>

      <CoincidenceSheet s={s} coins={coins} />
      <TabBar />
    </div>
  );
}

/** Why proximity is not running yet, and the one thing that turns it on. */
function NotNear({ status, s, location }: { status: ProximityStatus; s: { located: boolean; room: boolean }; location: ReturnType<typeof useLocation> }) {
  if (status === "connecting") return <div className="empty">{C.loading}</div>;
  const message = !s.room ? C.noRoom : !s.located ? C.needLocation : status === "denied" || location.status === "denied" ? C.locationDenied : C.proximityFailed;
  return (
    <div className="empty">
      <div className="empty-state">
        <p>{message}</p>
        {s.room && !s.located && (
          <button type="button" className="btn light" disabled={location.status === "locating"} onClick={location.locate}>
            {C.turnLocation}
          </button>
        )}
      </div>
    </div>
  );
}
