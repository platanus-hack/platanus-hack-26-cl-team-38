"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { Avatar, avatarSvg } from "./avatar";

// The graph engine shared by the phone (Coincidencias) and the desktop panel: people drawn in SVG,
// topic chips as HTML on top, and every position tweened so one layout morphs into the next.

// Colors live in nodo.css (.gbox): the graph is drawn on slate, selection is white.

export type Pose = { x: number; y: number; o: number; s: number };
export type Person = {
  kind: "person";
  name: string;
  /** The avatar's id (defaults to the entity id). */
  avatar?: string;
  me?: boolean;
  silo?: boolean;
  /** Selected: drawn with a white ring. */
  focus?: boolean;
  /** Ring color by relation (amigo, conocido, cercania). */
  tone?: string;
  onClick?: () => void;
};
export type Chip = { kind: "chip"; cls: string; icon?: ReactNode; label: string; n?: number; faces?: string[]; onClick?: () => void };
export type Entity = (Person | Chip) & { pose: Pose; from?: string };
export type Edge = { a: string; b: string; kind: "soft" | "strong" | "focus"; w?: number; dash?: string; o?: number; pulse?: number };

export const pose = (p: { x: number; y: number }, o = 1, s = 1): Pose => ({ ...p, o, s });

/** A point on an ellipse; n points spread from `from` to `to` degrees (a full turn has no duplicate end). */
export function onEllipse(i: number, n: number, rx: number, ry: number, cx: number, cy: number, from: number, to: number) {
  const full = to - from >= 359;
  const deg = n === 1 ? (full ? from : (from + to) / 2) : from + ((to - from) * i) / (n - (full ? 0 : 1));
  const a = (deg * Math.PI) / 180;
  return { x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry };
}

function useTween(targets: Record<string, Pose>, spawnFrom: Record<string, string | undefined>) {
  const [poses, setPoses] = useState<Record<string, Pose>>({});
  const cur = useRef<Record<string, Pose>>({});
  const goal = useRef(targets);
  const spawn = useRef(spawnFrom);
  const key = JSON.stringify(targets);

  useEffect(() => {
    goal.current = JSON.parse(key) as Record<string, Pose>;
    spawn.current = spawnFrom;
    let raf = 0;
    let last = 0;
    // Time-based easing, so the layout settles in the same time at 120 fps or at 2.
    const step = (now: number) => {
      const dt = last ? now - last : 16;
      last = now;
      const k = 1 - Math.exp(-dt / 110);
      const ko = 1 - Math.exp(-dt / 90);
      const g = goal.current;
      const c = cur.current;
      let moving = false;
      for (const id of Object.keys(g)) {
        if (!c[id]) {
          const src = spawn.current[id] ? c[spawn.current[id]!] : undefined;
          c[id] = src ? { ...src, o: 0, s: 0.4 } : { ...g[id], o: 0, s: 0.6 };
        }
      }
      for (const id of Object.keys(c)) {
        const t = g[id] ?? { ...c[id], o: 0 };
        const p = c[id];
        const next = { x: p.x + (t.x - p.x) * k, y: p.y + (t.y - p.y) * k, o: p.o + (t.o - p.o) * ko, s: p.s + (t.s - p.s) * k };
        if (Math.abs(next.x - t.x) + Math.abs(next.y - t.y) + Math.abs(next.o - t.o) * 50 + Math.abs(next.s - t.s) * 50 > 0.15) moving = true;
        else Object.assign(next, t);
        if (!g[id] && next.o < 0.02) delete c[id];
        else c[id] = next;
      }
      setPoses({ ...c });
      if (moving) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // spawnFrom is read through a ref; the layout key is what changes the animation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return poses;
}

function PersonNode({ id, n, p }: { id: string; n: Person; p: Pose }) {
  return (
    <g
      transform={`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) scale(${p.s.toFixed(3)})`}
      opacity={p.o}
      style={{ cursor: n.onClick ? "pointer" : undefined }}
      onClick={n.onClick}
      role={n.onClick ? "button" : undefined}
      aria-label={n.onClick ? `Ver a ${n.name}` : undefined}
    >
      <g className="breathe">
        {n.silo && <circle r={56} fill="none" className="me-ring" strokeWidth={1.5} strokeDasharray="4 8" />}
        <circle
          r={n.focus ? 26 : 23}
          fill="none"
          className={n.focus ? "ring" : n.tone ? `ring ${n.tone}` : "me-ring"}
          strokeWidth={n.focus ? 2.5 : n.me ? 3 : n.tone ? 2.5 : 2}
        />
        <svg x={-20} y={-20} width={40} height={40} viewBox="0 0 40 40" dangerouslySetInnerHTML={{ __html: avatarSvg(n.avatar ?? id) }} />
      </g>
      <text y={44} className="lbl">
        {n.name}
      </text>
    </g>
  );
}

/** One dot running along an edge, forever. */
function Pulse({ a, b, delay = 0 }: { a: Pose; b: Pose; delay?: number }) {
  const path = `M${a.x.toFixed(1)} ${a.y.toFixed(1)} L${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
  return (
    <circle r={3} fill="#f2f1ee" opacity={0.8}>
      <animateMotion dur="2.6s" begin={`${delay}s`} repeatCount="indefinite" path={path} />
    </circle>
  );
}

export function GraphCanvas({
  W,
  H,
  E,
  edges,
  under,
  onBackground,
}: {
  W: number;
  H: number;
  E: Record<string, Entity>;
  edges: Edge[];
  under?: ReactNode;
  onBackground?: () => void;
}) {
  const targets = Object.fromEntries(Object.entries(E).map(([id, e]) => [id, e.pose]));
  const spawnFrom = Object.fromEntries(Object.entries(E).map(([id, e]) => [id, e.from]));
  const P = useTween(targets, spawnFrom);

  return (
    <div className="gbox" style={{ aspectRatio: `${W} / ${H}` }}>
      <svg viewBox={`0 0 ${W} ${H}`} aria-hidden={!Object.values(E).some((e) => e.onClick)}>
        <rect width={W} height={H} fill="transparent" onClick={onBackground} />
        {under}
        {edges.map((e) => {
          const a = P[e.a];
          const b = P[e.b];
          if (!a || !b) return null;
          return (
            <g key={`${e.a}>${e.b}`} opacity={Math.min(a.o, b.o) * (e.o ?? 1)} pointerEvents="none">
              <line className={`edge ${e.kind}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} strokeWidth={e.w ?? 1.5} strokeDasharray={e.dash} strokeLinecap="round" />
              {e.pulse !== undefined && <Pulse a={a} b={b} delay={e.pulse * 0.37} />}
            </g>
          );
        })}
        {Object.keys(P).map((id) => {
          const n = E[id];
          return n?.kind === "person" ? <PersonNode key={id} id={id} n={n} p={P[id]} /> : null;
        })}
      </svg>
      {Object.keys(P).map((id) => {
        const c = E[id];
        if (!c || c.kind !== "chip") return null;
        const p = P[id];
        const style = { left: `${(p.x / W) * 100}%`, top: `${(p.y / H) * 100}%`, opacity: p.o, scale: String(p.s), ["--x" as string]: (p.x / W).toFixed(4) };
        return c.onClick ? (
          <button key={id} type="button" className={`gchip ${c.cls}`} style={style} onClick={c.onClick} aria-pressed={c.cls.includes("sel")}>
            {c.icon}
            {c.label}
            {c.n !== undefined && <span className="n">{c.n}</span>}
            {c.faces && c.faces.length > 0 && (
              <span className="faces">
                {c.faces.map((f) => (
                  <Avatar key={f} id={f} />
                ))}
              </span>
            )}
          </button>
        ) : (
          <div key={id} className={`gchip ${c.cls}`} style={style}>
            {c.icon}
            {c.label}
            {c.n !== undefined && <span className="n">{c.n}</span>}
            {c.faces && c.faces.length > 0 && (
              <span className="faces">
                {c.faces.map((f) => (
                  <Avatar key={f} id={f} />
                ))}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
