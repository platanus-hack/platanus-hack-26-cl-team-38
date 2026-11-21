"use client";

import { usePathname } from "next/navigation";
import type { Source } from "@/lib/types";
import { BrandLogo, SOURCE_META } from "./brand";
import { type Edge, type Entity, GraphCanvas, onEllipse, pose } from "./graph-canvas";
import { Icon } from "./icons";
import { AffinityGraph } from "./affinity-graph";
import { MatchGraph } from "./match-graph";
import { COPY } from "../_lib/copy";
import { isSensitive } from "../_lib/node";
import { affinities, byTopic, cap, clampRadius, coincidences, useEncounters } from "../_lib/people";
import { connectedSources, type PhoneState, usePhone } from "../_lib/store";

// The graph behind the phone, on slate: your Fuentes and topics while you build your Nodo, then
// your Coincidencias by topic, in sync with the phone. One line in mono says what is happening.

const W = 880;
const H = 600;
const SOURCES: Source[] = ["claude", "chatgpt", "gemini", "spotify", "github", "instagram"];

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
  E[me] = { kind: "person", name: s.displayName || "Tú", me: true, silo: sources.length === 0, pose: pose({ x: 440, y: 320 }, 1, 1.3) };
  SOURCES.forEach((src, i) => {
    const on = sources.includes(src);
    E[`src:${src}`] = {
      kind: "chip",
      cls: `ghost${on ? " on" : ""}`,
      icon: <BrandLogo source={src} />,
      label: SOURCE_META[src].label,
      pose: pose({ x: 115 + i * 130, y: 48 }, on || phase !== "compartir" ? 1 : 0.35),
    };
    if (on) edges.push({ a: `src:${src}`, b: me, kind: "soft", pulse: phase === "fuentes" ? i : undefined });
  });
  if (phase === "compartir") {
    const list = (s.node?.topics ?? []).slice(0, 14);
    list.forEach((t, i) => {
      const k = i % 2 ? 0.74 : 1;
      const shared = t.public && !isSensitive(t);
      E[`t:${t.id}`] = {
        kind: "chip",
        cls: shared ? "" : "off",
        icon: shared ? undefined : <Icon name="lock" />,
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
  const encounters = useEncounters();
  if (!s) return null;

  const phase = phaseOf(s, path);
  const coins = encounters ? coincidences(s, encounters) : [];
  const groups = byTopic(coins);
  const topics = s.node?.topics ?? [];
  const shared = topics.filter((t) => t.public && !isSensitive(t)).length;
  const n = connectedSources(s).length;
  const selected = groups.find((g) => g.topic === s.focus.topic);

  const status = {
    inicio: COPY.desktop.building,
    fuentes: `${n} ${n === 1 ? "Fuente" : "Fuentes"}`,
    compartir: `${shared} públicos · ${topics.length - shared} contigo`,
    coincidencias: `${coins.length} ${coins.length === 1 ? "Coincidencia" : "Coincidencias"} · ${clampRadius(s.radiusM)} m${selected ? ` · ${cap(selected.topic)}` : ""}`,
  }[phase];

  return (
    <section className="stage" aria-label="Grafo">
      <div className="gwrap">
        {path.startsWith("/afinidades") && phase === "coincidencias" ? (
          <AffinityGraph W={W} H={H} me={{ id: s.personId }} contacts={encounters ? affinities(s, encounters) : []} focus={s.focus.person} />
        ) : phase === "coincidencias" ? (
          <MatchGraph W={W} H={H} me={{ id: s.personId, name: s.displayName }} groups={groups} focus={s.focus} />
        ) : (
          <GraphCanvas W={W} H={H} {...nodeScene(phase, s)} />
        )}
      </div>
      <p className="status" role="status">
        {path.startsWith("/afinidades") && phase === "coincidencias" ? "Afinidades · Amigos, Conocidos y Cercanía" : status}
      </p>
    </section>
  );
}
