"use client";

import { type CSSProperties, useState } from "react";
import { Icon } from "./icons";
import { Mono } from "./ui";
import { COPY } from "../_lib/copy";
import { clampRadius, isVisible, RANGE } from "../_lib/people";
import { type PhoneState, setPhone } from "../_lib/store";

const C = COPY.coincidencias;

/** The filter button and its floating panel: Visible and the Distancia. The nearest positioned ancestor anchors the panel. */
export function NearFilters({ s, id }: { s: PhoneState; id: string }) {
  const [open, setOpen] = useState(false);
  const visible = isVisible(s);
  const radius = clampRadius(s.radiusM);

  return (
    <>
      <button
        type="button"
        className="filter-btn"
        aria-expanded={open}
        aria-controls={id}
        aria-label={C.filters}
        onClick={() => setOpen(!open)}
      >
        <Icon name="filter" />
      </button>
      {open && (
        <div id={id} className="filters">
          <label className="near-switch">
            <span>{C.visible}</span>
            <button
              type="button"
              role="switch"
              aria-checked={visible}
              aria-label={C.visible}
              className="switch"
              onClick={() => setPhone({ privacy: { ...s.privacy, discoverable: !visible } })}
            />
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
    </>
  );
}
