"use client";

import { usePathname } from "next/navigation";
import type { Source } from "@/lib/types";
import { BrandLogo, SOON_META, SoonLogo, type SoonSource, SOURCE_META } from "./brand";
import { type Edge, type Entity, GraphCanvas, onEllipse, pose } from "./graph-canvas";
import { AffinityGraph } from "./affinity-graph";
import { MatchGraph } from "./match-graph";
import { PlanStage } from "./plan-network";
import { COPY } from "../_lib/copy";
import { isPublished } from "../_lib/node";
import { byTopic, cap, clampRadius, coincidences, DEMO, fmtMeters, isVisible, searchTopics } from "../_lib/people";
import { useNearby } from "../_lib/proximity";
import { isPlanId, useContacts } from "../_lib/plans";
import { connectedSources, type PhoneState, usePhone } from "../_lib/store";

// The graph behind the phone, on slate: your Fuentes and topics while you build your Nodo, then
// your Coincidencias by topic, in sync with the phone. One line in mono says what is happening.

const W = 880;
const H = 600;
const SOURCES: Source[] = ["claude", "chatgpt", "gemini", "google", "spotify", "github"];
/** The only Fuentes the demo shows as ready; the rest carry a "pronto" on top. */
const READY: Source[] = ["claude", "chatgpt"];
const PER_ROW = 4;
// In graph units (880 wide): 160 keeps the widest chip (Letterboxd, 115 px) clear of its neighbour
// in a 652 px panel, and narrower panels shrink the chips (nodo.css); 96 leaves room for the
// "pronto" above the second row.
const PITCH = 160;
const ROW_GAP = 96;
/** Shown like in the onboarding: coming soon, never connected. */
const SOON: SoonSource[] = ["strava", "letterboxd"];

type Phase = "inicio" | "fuentes" | "compartir" | "coincidencias";

function phaseOf(s: PhoneState, path: string): Phase {
  if (!s.displayName) return "inicio";
  if (path.startsWith("/bienvenida") || !s.onboarded) return s.node ? "compartir" : "fuentes";
  return "coincidencias";
}

function nodeScene(phase: Phase, s: PhoneState) {
  const E: Record<string, Entity> = {};
  const edges: Edge[] = [];
  const me = s.personId;
  const sources = connectedSources(s);
  E[me] = {
    kind: "person",
    name: s.displayName || "Tú",
    me: true,
    silo: sources.length === 0,
    pose: pose({ x: 440, y: 320 }, 1, 1.3),
  };
  // Eight Fuentes in two rows of four: in one row they overlap once the panel is narrower than ~900 px.
  const slot = (i: number) => ({
    x: W / 2 + ((i % PER_ROW) - (PER_ROW - 1) / 2) * PITCH,
    y: 52 + Math.floor(i / PER_ROW) * ROW_GAP,
  });
  SOURCES.forEach((src, i) => {
    const on = sources.includes(src);
    E[`src:${src}`] = {
      kind: "chip",
      cls: `ghost${on ? " on" : ""}`,
      icon: <BrandLogo source={src} />,
      label: SOURCE_META[src].label,
      badge: READY.includes(src) ? undefined : COPY.bienvenida.soon,
      pose: pose(slot(i), on || phase !== "compartir" ? 1 : 0.35),
    };
    if (on) edges.push({ a: `src:${src}`, b: me, kind: "soft", pulse: phase === "fuentes" ? i : undefined });
  });
  SOON.forEach((src, i) => {
    E[`soon:${src}`] = {
      kind: "chip",
      cls: "ghost",
      icon: <SoonLogo source={src} />,
      label: SOON_META[src].label,
      badge: COPY.bienvenida.soon,
      pose: pose(slot(SOURCES.length + i), phase !== "compartir" ? 1 : 0.35),
    };
  });
  if (phase === "compartir") {
    const list = (s.node?.topics ?? []).slice(0, 14);
    list.forEach((t, i) => {
      const k = i % 2 ? 0.74 : 1;
      const shared = isPublished(t);
      E[`t:${t.id}`] = {
        kind: "chip",
        cls: shared ? "" : "off",
        label: cap(t.name),
        from: me,
        pose: pose(onEllipse(i, list.length, 330 * k, 200 * k, 440, 340, -35, 215)),
      };
    });
  }
  return { E, edges };
}

export function GraphStage() {
  const s = usePhone();
  const path = usePathname();
  const { encounters } = useNearby(s);
  const contacts = useContacts(s);
  if (!s) return null;

  // An Iniciativa on screen: the panel shows its network instead of your Coincidencias.
  const open = decodeURIComponent(path.match(/^\/conversaciones\/([^/]+)/)?.[1] ?? "");
  if (!DEMO && s.onboarded && isPlanId(open)) return <PlanStage id={open} me={s.personId} />;

  const phase = phaseOf(s, path);
  const visible = isVisible(s);
  const coins = encounters && visible ? coincidences(s, encounters) : [];
  // Inicio shows the Intereses you share; every other screen, the people around you.
  const people = path !== "/";
  const groups = byTopic(coins);
  const topics = s.node?.topics ?? [];
  const shared = topics.filter((t) => isPublished(t)).length;
  const n = connectedSources(s).length;
  const selected = groups.find((g) => g.topic === s.focus.topic);

  const D = COPY.desktop;
  const status = {
    inicio: D.building,
    fuentes: D.sources(n),
    compartir: COPY.nodo.count(shared, topics.length - shared),
    coincidencias: visible
      ? `${D.coincidences(coins.length)} · ${fmtMeters(clampRadius(s.radiusM))}${selected && !people ? ` · ${cap(selected.topic)}` : ""}`
      : D.invisible,
  }[phase];

  const affinity = path.startsWith("/afinidades") && phase === "coincidencias";
  const L = COPY.desktop.legend;

  return (
    <section className="stage" aria-label={D.graph}>
      {/* how to read the graph, in the corner */}
      {affinity ? (
        <ul className="legend">
          <li>
            <i className="dot amigo" />
            {L.amigos}
          </li>
          <li>
            <i className="dot conocido" />
            {L.conocidos}
          </li>
          <li className="mute">{L.close}</li>
          <li className="mute">{L.size}</li>
          <li className="mute">{L.drag}</li>
        </ul>
      ) : phase === "coincidencias" && people ? (
        <ul className="legend">
          <li>{L.close}</li>
          <li className="mute">{L.size}</li>
        </ul>
      ) : phase === "coincidencias" ? (
        <ul className="legend">
          <li>{L.topics}</li>
          <li className="mute">{L.tap}</li>
        </ul>
      ) : null}
      {phase === "coincidencias" && !affinity && encounters && groups.length === 0 && (
        <div className="stage-empty">
          <p>{visible ? L.empty : COPY.coincidencias.invisible}</p>
          {visible && <p className="mute">{L.emptyHint}</p>}
        </div>
      )}
      <div className="gwrap">
        {affinity ? (
          <AffinityGraph
            W={W}
            H={H}
            me={{ id: s.personId }}
            contacts={contacts ?? []}
            focus={s.focus.person}
            match={contacts ? (searchTopics(contacts, s.affinityQuery ?? "")?.ids ?? null) : null}
          />
        ) : phase === "coincidencias" && people ? (
          <AffinityGraph W={W} H={H} me={{ id: s.personId }} contacts={coins} focus={s.focus.person} />
        ) : phase === "coincidencias" ? (
          <MatchGraph W={W} H={H} me={{ id: s.personId, name: s.displayName }} groups={groups} focus={s.focus} />
        ) : (
          <GraphCanvas W={W} H={H} {...nodeScene(phase, s)} />
        )}
      </div>
      <p className="status" role="status">
        {affinity ? D.contacts : status}
      </p>
    </section>
  );
}
