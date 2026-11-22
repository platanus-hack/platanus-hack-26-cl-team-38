"use client";

import {
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Avatar, avatarSvg } from "./avatar";
import { usePhone } from "../_lib/store";

// The graph engine shared by the phone (Coincidencias) and the desktop panel: people drawn in SVG,
// topic chips as HTML on top, and every position tweened so one layout morphs into the next.

// Colors live in nodo.css (.gbox): the graph is drawn on slate, selection is white.

export type Pose = { x: number; y: number; o: number; s: number };
type Person = {
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
type Chip = {
  kind: "chip";
  cls: string;
  icon?: ReactNode;
  label: string;
  n?: number;
  faces?: string[];
  badge?: string;
  onClick?: () => void;
};
export type Entity = (Person | Chip) & { pose: Pose; from?: string };
export type Edge = {
  a: string;
  b: string;
  kind: "soft" | "strong" | "focus";
  w?: number;
  dash?: string;
  o?: number;
  pulse?: number;
};

export const pose = (p: { x: number; y: number }, o = 1, s = 1): Pose => ({ ...p, o, s });

/** A point on an ellipse; n points spread from `from` to `to` degrees (a full turn has no duplicate end). */
export function onEllipse(
  i: number,
  n: number,
  rx: number,
  ry: number,
  cx: number,
  cy: number,
  from: number,
  to: number,
) {
  const full = to - from >= 359;
  const deg = n === 1 ? (full ? from : (from + to) / 2) : from + ((to - from) * i) / (n - (full ? 0 : 1));
  const a = (deg * Math.PI) / 180;
  return { x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry };
}

type Drag = { id: string; x: number; y: number } | null;
type Vel = { vx: number; vy: number };

/** Spring for a node you let go of: a little overshoot, settles in about half a second. */
const SPRING = { k: 170, d: 13 };

function useTween(targets: Record<string, Pose>, spawnFrom: Record<string, string | undefined>) {
  const [poses, setPoses] = useState<Record<string, Pose>>({});
  const cur = useRef<Record<string, Pose>>({});
  const goal = useRef(targets);
  const spawn = useRef(spawnFrom);
  // Dragging: the held node follows the pointer; released ones spring back with their velocity.
  const drag = useRef<Drag>(null);
  const springs = useRef<Record<string, Vel>>({});
  const kick = useRef<() => void>(() => {});
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
      const held = drag.current;
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
        const v = springs.current[id];
        let next: Pose;
        if (held?.id === id) {
          // Held: on the pointer, a little bigger.
          next = { x: held.x, y: held.y, o: p.o + (t.o - p.o) * ko, s: p.s + (t.s * 1.15 - p.s) * k };
          moving = true;
        } else if (v) {
          // Released: a damped spring back to its place (semi-implicit Euler, small steps).
          let { x, y } = p;
          let left = Math.min(dt, 64) / 1000;
          while (left > 0) {
            const h = Math.min(left, 1 / 120);
            v.vx += ((t.x - x) * SPRING.k - v.vx * SPRING.d) * h;
            v.vy += ((t.y - y) * SPRING.k - v.vy * SPRING.d) * h;
            x += v.vx * h;
            y += v.vy * h;
            left -= h;
          }
          next = { x, y, o: p.o + (t.o - p.o) * ko, s: p.s + (t.s - p.s) * k };
          if (Math.abs(t.x - x) + Math.abs(t.y - y) < 0.2 && Math.abs(v.vx) + Math.abs(v.vy) < 3) {
            delete springs.current[id];
            next = { ...next, x: t.x, y: t.y };
          } else moving = true;
        } else {
          next = {
            x: p.x + (t.x - p.x) * k,
            y: p.y + (t.y - p.y) * k,
            o: p.o + (t.o - p.o) * ko,
            s: p.s + (t.s - p.s) * k,
          };
          if (
            Math.abs(next.x - t.x) +
              Math.abs(next.y - t.y) +
              Math.abs(next.o - t.o) * 50 +
              Math.abs(next.s - t.s) * 50 >
            0.15
          )
            moving = true;
          else Object.assign(next, t);
        }
        if (!g[id] && next.o < 0.02) delete c[id];
        else c[id] = next;
      }
      setPoses({ ...c });
      raf = moving ? requestAnimationFrame(step) : 0;
    };
    kick.current = () => {
      if (!raf) {
        last = 0;
        raf = requestAnimationFrame(step);
      }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // spawnFrom is read through a ref; the layout key is what changes the animation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  /** Hold a node at a point (null lets go without a throw). */
  const hold = useCallback((d: Drag) => {
    drag.current = d;
    if (d) delete springs.current[d.id];
    kick.current();
  }, []);
  /** Let go of a node with a velocity; it springs back to its place. */
  const release = useCallback((id: string, v: Vel) => {
    drag.current = null;
    springs.current[id] = v;
    kick.current();
  }, []);

  return { poses, hold, release };
}

function PersonNode({
  id,
  n,
  p,
  onGrab,
}: {
  id: string;
  n: Person;
  p: Pose;
  onGrab?: (e: ReactPointerEvent, id: string) => void;
}) {
  const r = n.focus ? 26 : 23;
  const phone = usePhone();
  const photo = n.me ? phone?.photo : null;
  return (
    <g
      transform={`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`}
      opacity={p.o}
      className={onGrab ? "drag" : undefined}
      style={{ cursor: onGrab ? "grab" : n.onClick ? "pointer" : undefined }}
      onClick={onGrab ? undefined : n.onClick}
      onPointerDown={onGrab ? (e) => onGrab(e, id) : undefined}
      onKeyDown={n.onClick ? (e) => (e.key === "Enter" || e.key === " ") && n.onClick?.() : undefined}
      tabIndex={n.onClick ? 0 : undefined}
      role={n.onClick ? "button" : undefined}
      aria-label={n.onClick ? `Ver a ${n.name}` : undefined}
    >
      <g transform={`scale(${p.s.toFixed(3)})`}>
        <g className="breathe">
          {n.silo && <circle r={56} fill="none" className="me-ring" strokeWidth={1.5} strokeDasharray="4 8" />}
          <circle r={r} className="disc" />
          <circle
            r={r}
            fill="none"
            className={n.focus ? "ring" : n.tone ? `ring ${n.tone}` : "me-ring"}
            strokeWidth={n.focus ? 2.5 : n.me ? 3 : n.tone ? 2.5 : 2}
          />
          {photo ? (
            <image
              href={photo}
              x={-20}
              y={-20}
              width={40}
              height={40}
              preserveAspectRatio="xMidYMid slice"
              clipPath="circle(50%)"
            />
          ) : (
            <svg
              x={-20}
              y={-20}
              width={40}
              height={40}
              viewBox="0 0 40 40"
              dangerouslySetInnerHTML={{ __html: avatarSvg(n.avatar ?? id) }}
            />
          )}
        </g>
      </g>
    </g>
  );
}

/** Names go in a layer above every circle, at a size that does not shrink with the circle. */
function PersonLabel({ n, p }: { n: Person; p: Pose }) {
  const r = n.focus ? 26 : 23;
  return (
    <text x={p.x} y={p.y + (r + 4) * p.s + 13} className="lbl" opacity={p.o} pointerEvents="none">
      {n.name}
    </text>
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
  draggable = false,
}: {
  W: number;
  H: number;
  E: Record<string, Entity>;
  edges: Edge[];
  under?: ReactNode;
  onBackground?: () => void;
  /** People can be dragged around; let go and they spring back. A tap still opens them. */
  draggable?: boolean;
}) {
  const targets = Object.fromEntries(Object.entries(E).map(([id, e]) => [id, e.pose]));
  const spawnFrom = Object.fromEntries(Object.entries(E).map(([id, e]) => [id, e.from]));
  const { poses: P, hold, release } = useTween(targets, spawnFrom);
  const svg = useRef<SVGSVGElement>(null);
  // The gesture in progress: where it started, whether it moved, and the last two samples for the throw.
  const grab = useRef<{
    id: string;
    pid: number;
    sx: number;
    sy: number;
    moved: boolean;
    last: { x: number; y: number; t: number }[];
  } | null>(null);

  const toSvg = (e: { clientX: number; clientY: number }) => {
    const m = svg.current?.getScreenCTM();
    if (!m) return null;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: Math.max(0, Math.min(W, pt.x)), y: Math.max(0, Math.min(H, pt.y)) };
  };
  const onGrab = (e: ReactPointerEvent, id: string) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    svg.current?.setPointerCapture(e.pointerId);
    grab.current = { id, pid: e.pointerId, sx: e.clientX, sy: e.clientY, moved: false, last: [] };
  };
  const onMove = (e: ReactPointerEvent) => {
    const g = grab.current;
    if (!g || g.pid !== e.pointerId) return;
    if (!g.moved && Math.hypot(e.clientX - g.sx, e.clientY - g.sy) < 6) return;
    const at = toSvg(e);
    if (!at) return;
    g.moved = true;
    g.last = [...g.last.slice(-1), { ...at, t: e.timeStamp }];
    hold({ id: g.id, ...at });
  };
  const onUp = (e: ReactPointerEvent) => {
    const g = grab.current;
    if (!g || g.pid !== e.pointerId) return;
    grab.current = null;
    if (!g.moved) {
      const n = E[g.id];
      if (n?.kind === "person") n.onClick?.();
      return;
    }
    // Throw: the release velocity feeds the spring, capped so it never flies off.
    const [a, b] = g.last;
    const dt = a && b ? Math.max(8, b.t - a.t) / 1000 : 1;
    const cap = (v: number) => Math.max(-1600, Math.min(1600, v));
    release(g.id, a && b ? { vx: cap((b.x - a.x) / dt), vy: cap((b.y - a.y) / dt) } : { vx: 0, vy: 0 });
  };

  return (
    <div className="gbox" style={{ aspectRatio: `${W} / ${H}` }}>
      <svg
        ref={svg}
        viewBox={`0 0 ${W} ${H}`}
        aria-hidden={!Object.values(E).some((e) => e.onClick)}
        onPointerMove={draggable ? onMove : undefined}
        onPointerUp={draggable ? onUp : undefined}
        onPointerCancel={draggable ? onUp : undefined}
      >
        <rect width={W} height={H} fill="transparent" onClick={onBackground} />
        {under}
        {edges.map((e) => {
          const a = P[e.a];
          const b = P[e.b];
          if (!a || !b) return null;
          return (
            <g key={`${e.a}>${e.b}`} opacity={Math.min(a.o, b.o) * (e.o ?? 1)} pointerEvents="none">
              <line
                className={`edge ${e.kind}`}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                strokeWidth={e.w ?? 1.5}
                strokeDasharray={e.dash}
                strokeLinecap="round"
              />
              {e.pulse !== undefined && <Pulse a={a} b={b} delay={e.pulse * 0.37} />}
            </g>
          );
        })}
        {Object.keys(P).map((id) => {
          const n = E[id];
          return n?.kind === "person" ? (
            <PersonNode key={id} id={id} n={n} p={P[id]} onGrab={draggable ? onGrab : undefined} />
          ) : null;
        })}
        {Object.keys(P).map((id) => {
          const n = E[id];
          return n?.kind === "person" ? <PersonLabel key={`l:${id}`} n={n} p={P[id]} /> : null;
        })}
      </svg>
      {Object.keys(P).map((id, i) => {
        const c = E[id];
        if (!c || c.kind !== "chip") return null;
        const p = P[id];
        // --d staggers the float, so chips never bob in step.
        const style = {
          left: `${(p.x / W) * 100}%`,
          top: `${(p.y / H) * 100}%`,
          opacity: p.o,
          scale: String(p.s),
          ["--x" as string]: (p.x / W).toFixed(4),
          ["--d" as string]: `${(-i * 0.73) % 4}s`,
        };
        const faces = c.faces && c.faces.length > 0;
        const body = (
          <>
            {c.badge && <span className="gchip-badge">{c.badge}</span>}
            <span className="gchip-row">
              {c.icon}
              {c.label}
              {c.n !== undefined && !faces && <span className="n">{c.n}</span>}
            </span>
            {faces && (
              <span className="faces">
                {c.faces!.map((f) => (
                  <Avatar key={f} id={f} />
                ))}
                {c.n !== undefined && <span className="n">+{c.n}</span>}
              </span>
            )}
          </>
        );
        const cls = `gchip ${c.cls}${faces ? " stacked" : ""}`;
        return c.onClick ? (
          <button
            key={id}
            type="button"
            className={cls}
            style={style}
            onClick={c.onClick}
            aria-pressed={c.cls.includes("sel")}
          >
            {body}
          </button>
        ) : (
          <div key={id} className={cls} style={style}>
            {body}
          </div>
        );
      })}
    </div>
  );
}
