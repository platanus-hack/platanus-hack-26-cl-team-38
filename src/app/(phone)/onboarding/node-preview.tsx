"use client";

import { useEffect, useRef, useState } from "react";
import { ROLE } from "@/app/explorar/palette";
import { rolesOf } from "@/app/explorar/preview";
import type { Topic } from "@/lib/types";
import { layoutPreview, nodeRadius, RING, type Point } from "./preview-layout";

const PRIVATE = "#8A94A3";
const TWEEN_MS = 400;
const shortName = (name: string) => (name.length > 18 ? `${name.slice(0, 17)}…` : name);

// Eases from the last drawn positions to the new layout, so a topic that changes side visibly
// crosses the ring.
function useTween(target: Map<string, Point>) {
  const [shown, setShown] = useState(target);
  const shownRef = useRef(target);
  useEffect(() => {
    const from = shownRef.current;
    const start = performance.now();
    let frame = requestAnimationFrame(function step(now) {
      const k = Math.min(1, (now - start) / TWEEN_MS);
      const ease = 1 - (1 - k) ** 3;
      const next = new Map<string, Point>();
      for (const [id, to] of target) {
        const a = from.get(id) ?? to;
        next.set(id, { x: a.x + (to.x - a.x) * ease, y: a.y + (to.y - a.y) * ease });
      }
      shownRef.current = next;
      setShown(next);
      if (k < 1) frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  }, [target]);
  return shown;
}

export function NodePreview({ topics, ownerName, locked, onToggle }: { topics: Topic[]; ownerName: string; locked: boolean; onToggle: (topic: Topic) => void }) {
  const [asRoom, setAsRoom] = useState(false);
  // Each new layout starts from the previous one, so untouched topics stay where they were.
  const key = topics.map((t) => `${t.id}:${t.public}:${t.depth}`).join("|");
  const inputs = () => topics.map((t) => ({ id: t.id, public: t.public, depth: t.depth }));
  const [layout, setLayout] = useState(() => ({ key, points: layoutPreview(inputs()) }));
  if (layout.key !== key) setLayout({ key, points: layoutPreview(inputs(), layout.points) });
  const shown = useTween(layout.points);
  const shared = topics.filter((t) => t.public).length;

  return (
    <section className="flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">Tu nodo</h3>
        <div role="radiogroup" aria-label="Vista" className="flex rounded-lg bg-muted p-0.5 text-xs">
          {[
            [false, "Lo que ves tú"],
            [true, "Lo que ve la sala"],
          ].map(([value, label]) => (
            <button
              key={String(value)}
              type="button"
              role="radio"
              aria-checked={asRoom === value}
              onClick={() => setAsRoom(value as boolean)}
              className={`rounded-md px-2 py-1 ${asRoom === value ? "bg-background shadow-sm" : "text-muted-foreground"}`}
            >
              {label as string}
            </button>
          ))}
        </div>
      </div>

      <svg viewBox="-225 -225 450 450" className="w-full touch-manipulation select-none" role="group" aria-label="Vista previa de tu nodo: público adentro del círculo, privado afuera">
        <circle r={RING} fill="rgba(31,138,91,0.06)" stroke="rgba(31,138,91,0.5)" strokeDasharray="4 4" />
        <text y={-RING - 6} textAnchor="middle" fontSize={10} fill="rgba(31,138,91,0.9)">
          lo ve la sala
        </text>
        {!asRoom && (
          <text y={218} textAnchor="middle" fontSize={10} fill={PRIVATE}>
            privado: solo personalidad de tu agente
          </text>
        )}

        {topics.map((t) => {
          const p = shown.get(t.id);
          if (!p || (asRoom && !t.public)) return null;
          const color = t.public ? ROLE[rolesOf(t)[0] ?? "comparte"].color : PRIVATE;
          return <line key={`spoke:${t.id}`} x1={0} y1={0} x2={p.x} y2={p.y} stroke={color} strokeOpacity={t.public ? 0.45 : 0.3} strokeDasharray={t.public ? undefined : "3 3"} />;
        })}

        <circle r={22} fill="#F2B84B" />
        <text textAnchor="middle" dy="0.35em" fontSize={11} fontWeight={600} fill="#18212F">
          {shortName(ownerName || "Tú").slice(0, 8)}
        </text>

        {topics.map((t) => {
          const p = shown.get(t.id);
          if (!p || (asRoom && !t.public)) return null;
          const r = nodeRadius(t.depth);
          const color = t.public ? ROLE[rolesOf(t)[0] ?? "comparte"].color : PRIVATE;
          const toggle = () => !locked && onToggle(t);
          return (
            <g
              key={t.id}
              transform={`translate(${p.x} ${p.y})`}
              role="switch"
              aria-checked={t.public}
              aria-label={`${t.name}: ${t.public ? "público" : "privado"}`}
              tabIndex={0}
              className={locked ? "cursor-wait" : "cursor-pointer"}
              onClick={toggle}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  toggle();
                }
              }}
            >
              <circle r={r + 8} fill="transparent" />
              <circle r={r} fill={t.public ? color : "white"} stroke={color} strokeWidth={1.5} strokeDasharray={t.public ? undefined : "2.5 2"} />
              <text y={r + 10} textAnchor="middle" fontSize={10} fill={t.public ? "#18212F" : PRIVATE} stroke="white" strokeWidth={3} paintOrder="stroke">
                {shortName(t.name)}
              </text>
            </g>
          );
        })}
      </svg>

      <p className="text-xs text-muted-foreground">
        {asRoom
          ? `La sala ve ${shared} ${shared === 1 ? "tópico" : "tópicos"}. Para ella, lo privado no existe.`
          : "Toca un tópico para cambiarlo de lado. Relleno: público, con el color de su rol (aporta, busca, comparte). Punteado: privado."}
      </p>
    </section>
  );
}
