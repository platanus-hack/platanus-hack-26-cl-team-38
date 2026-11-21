"use client";

import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { Link, LinkType, TopicNode } from "./graph";
import { INK, ROLE } from "../explorar/palette";

export const LINK_STYLE: Record<LinkType, { color: string; label: string }> = {
  complemento: { color: ROLE.aporta.color, label: "Complemento: uno busca lo que otro aporta" },
  afinidad: { color: ROLE.comparte.color, label: "Afinidad: tienen algo parecido" },
};
export const ME_COLOR = "#F2B84B";

type SimNode = SimulationNodeDatum & { id: string; kind: "person" | "topic"; r: number };
type SimLink = SimulationLinkDatum<SimNode> & { id: string; type: LinkType | "owns"; score: number };

const PERSON_R = 20;
const topicRadius = (depth: number) => 4 + depth * 2.5;

export type Focus = { nodeIds: Set<string> } | undefined;

export function ForceGraph({
  people,
  nodes,
  links,
  focus,
  selectedPerson,
  onSelectPerson,
  me,
}: {
  people: { personId: string; displayName: string }[];
  nodes: TopicNode[];
  me?: string;
  links: Link[];
  focus: Focus;
  selectedPerson?: string;
  onSelectPerson: (personId?: string) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const positions = useRef(new Map<string, { x: number; y: number }>());
  const simNodesRef = useRef(new Map<string, SimNode>());
  const simRef = useRef<Simulation<SimNode, SimLink>>(null);
  const [layout, setLayout] = useState(new Map<string, { x: number; y: number }>());
  const [view, setView] = useState({ x: -600, y: -450, w: 1200, h: 900 });
  const [hover, setHover] = useState<string>();
  const drag = useRef<{ node?: SimNode; panFrom?: { x: number; y: number; view: typeof view }; moved: boolean }>(null);

  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const names = useMemo(() => new Map(people.map((p) => [p.personId, p.displayName])), [people]);
  const edges = useMemo(
    () => [
      ...nodes.map((n) => ({ id: `owns:${n.id}`, source: `person:${n.personId}`, target: n.id, type: "owns" as const, score: 1 })),
      ...links.map((l) => ({ id: `${l.source}->${l.target}`, ...l })),
    ],
    [nodes, links],
  );

  useEffect(() => {
    // Nodes keep their last position across threshold changes so the graph morphs instead of reshuffling.
    const place = (id: string, r: number, kind: SimNode["kind"]): SimNode => {
      const prev = positions.current.get(id);
      return { id, r, kind, x: prev?.x ?? (Math.random() - 0.5) * 600, y: prev?.y ?? (Math.random() - 0.5) * 450 };
    };
    const simNodes: SimNode[] = [
      ...people.map((p) => place(`person:${p.personId}`, PERSON_R, "person")),
      ...nodes.map((n) => place(n.id, topicRadius(n.depth), "topic")),
    ];
    const simLinks: SimLink[] = edges.map((e) => ({ ...e }));
    simNodesRef.current = new Map(simNodes.map((n) => [n.id, n]));

    const sim = forceSimulation(simNodes)
      .force(
        "link",
        forceLink<SimNode, SimLink>(simLinks)
          .id((d) => d.id)
          .distance((l) => (l.type === "owns" ? 46 : 80 - l.score * 30))
          .strength((l) => (l.type === "owns" ? 0.9 : 0.15 + l.score * 0.35)),
      )
      .force("charge", forceManyBody<SimNode>().strength((d) => (d.kind === "person" ? -420 : -110)))
      .force("collide", forceCollide<SimNode>((d) => d.r + (d.kind === "person" ? 22 : 10)))
      .force("x", forceX(0).strength(0.04))
      .force("y", forceY(0).strength(0.05))
      .alpha(positions.current.size > 0 ? 0.5 : 1)
      .on("tick", () => {
        const next = new Map(simNodes.map((n) => [n.id, { x: n.x!, y: n.y! }]));
        positions.current = next;
        setLayout(next);
      });
    simRef.current = sim;
    return () => {
      sim.stop();
    };
  }, [people, nodes, edges]);

  const toSvg = (e: { clientX: number; clientY: number }) => {
    const svg = svgRef.current!;
    const point = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM()!.inverse());
    return { x: point.x, y: point.y };
  };

  const onPointerDownNode = (e: ReactPointerEvent, id: string) => {
    e.stopPropagation();
    const node = simNodesRef.current.get(id);
    if (!node) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { node, moved: false };
    node.fx = node.x;
    node.fy = node.y;
    simRef.current?.alphaTarget(0.25).restart();
  };

  const onPointerDownBackground = (e: ReactPointerEvent) => {
    drag.current = { panFrom: { x: e.clientX, y: e.clientY, view }, moved: false };
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    d.moved = true;
    if (d.node) {
      const p = toSvg(e);
      d.node.fx = p.x;
      d.node.fy = p.y;
    } else if (d.panFrom) {
      const rect = svgRef.current!.getBoundingClientRect();
      const scale = Math.max(d.panFrom.view.w / rect.width, d.panFrom.view.h / rect.height);
      setView({ ...d.panFrom.view, x: d.panFrom.view.x - (e.clientX - d.panFrom.x) * scale, y: d.panFrom.view.y - (e.clientY - d.panFrom.y) * scale });
    }
  };

  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.node) {
      d.node.fx = null;
      d.node.fy = null;
      simRef.current?.alphaTarget(0);
      if (!d.moved && d.node.kind === "person") {
        const personId = d.node.id.slice("person:".length);
        onSelectPerson(personId === selectedPerson ? undefined : personId);
      }
    } else if (!d.moved) {
      onSelectPerson(undefined);
    }
  };

  const onWheel = (e: React.WheelEvent) => {
    const p = toSvg(e);
    const k = Math.exp(e.deltaY * 0.0015);
    setView((v) => {
      const w = Math.min(4000, Math.max(250, v.w * k));
      const ratio = w / v.w;
      return { x: p.x - (p.x - v.x) * ratio, y: p.y - (p.y - v.y) * ratio, w, h: v.h * ratio };
    });
  };

  // Hovering a node previews its neighbourhood without losing the sidebar selection.
  const hoverFocus = useMemo(() => {
    if (!hover) return undefined;
    const ids = new Set([hover]);
    for (const e of edges) {
      if (e.source === hover) ids.add(e.target);
      if (e.target === hover) ids.add(e.source);
    }
    return ids;
  }, [hover, edges]);
  const lit = hoverFocus ?? focus?.nodeIds;
  const isLit = (id: string) => !lit || lit.has(id);

  const pos = (id: string) => layout.get(id) ?? { x: 0, y: 0 };

  return (
    <svg
      ref={svgRef}
      viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
      className="h-full w-full touch-none select-none"
      role="group"
      aria-label="Grafo de la sala: personas, sus nodos de conocimiento y los enlaces entre ellos"
      onPointerDown={onPointerDownBackground}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      onWheel={onWheel}
    >
      <defs>
        <marker id="arrow-complemento" viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse" markerWidth="9" markerHeight="9" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill={LINK_STYLE.complemento.color} />
        </marker>
      </defs>

      <g>
        {edges.map((l) => {
          const s = l.source;
          const t = l.target;
          const a = pos(s);
          const b = pos(t);
          const on = isLit(s) && isLit(t);
          if (l.type === "owns") {
            return <line key={l.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={INK} strokeOpacity={on ? 0.18 : 0.04} strokeWidth={1} />;
          }
          const style = LINK_STYLE[l.type];
          // Stop the arrow at the target's rim so the head stays visible.
          const r = topicRadius(byId.get(t)?.depth ?? 1) + 2;
          const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
          const x2 = b.x - ((b.x - a.x) / len) * r;
          const y2 = b.y - ((b.y - a.y) / len) * r;
          return (
            <line
              key={l.id}
              x1={a.x}
              y1={a.y}
              x2={l.type === "complemento" ? x2 : b.x}
              y2={l.type === "complemento" ? y2 : b.y}
              stroke={style.color}
              strokeWidth={1 + (l.score - 0.4) * 5}
              strokeOpacity={on ? 0.85 : 0.08}
              markerEnd={l.type === "complemento" ? "url(#arrow-complemento)" : undefined}
            >
              <title>{`${byId.get(s)?.name} ↔ ${byId.get(t)?.name} · ${l.type.replace("_", " ")} ${l.score.toFixed(2)}`}</title>
            </line>
          );
        })}
      </g>

      <g>
        {nodes.map((k) => {
            const n = { id: k.id, r: topicRadius(k.depth) };
            const p = pos(n.id);
            const on = isLit(n.id);
            const busca = k.role === "busca";
            return (
              <g
                key={n.id}
                transform={`translate(${p.x}, ${p.y})`}
                opacity={on ? 1 : 0.15}
                className="cursor-grab"
                onPointerDown={(e) => onPointerDownNode(e, n.id)}
                onPointerEnter={() => setHover(n.id)}
                onPointerLeave={() => setHover(undefined)}
              >
                <title>{`${names.get(k.personId)} · ${k.roles.join(", ")} · ${k.name} · profundidad ${k.depth} · ${k.sources.join(", ")}`}</title>
                <circle
                  r={n.r}
                  fill={busca ? "white" : ROLE[k.role].color}
                  stroke={busca ? ROLE.busca.color : "white"}
                  strokeWidth={busca ? 2 : 1.5}
                  strokeDasharray={busca ? "3 2" : undefined}
                />
                <text x={n.r + 4} dy="0.35em" fontSize={10.5} fill={INK} fillOpacity={0.8} pointerEvents="none" className="[paint-order:stroke] [stroke:#E9EDF1] [stroke-width:3px]">
                  {k.name}
                </text>
              </g>
            );
          })}
      </g>

      <g>
        {people.map((person) => {
          const id = `person:${person.personId}`;
          const n = { r: PERSON_R };
          const p = pos(id);
          const isSelected = person.personId === selectedPerson;
          const on = isLit(id);
          return (
            <g
              key={id}
              transform={`translate(${p.x}, ${p.y})`}
              opacity={on ? 1 : 0.2}
              role="button"
              tabIndex={0}
              aria-pressed={isSelected}
              aria-label={person.displayName}
              className="cursor-pointer outline-none"
              onPointerDown={(e) => onPointerDownNode(e, id)}
              onPointerEnter={() => setHover(id)}
              onPointerLeave={() => setHover(undefined)}
              onKeyDown={(e) => {
                if (e.key !== "Enter" && e.key !== " ") return;
                e.preventDefault();
                onSelectPerson(isSelected ? undefined : person.personId);
              }}
            >
              <circle r={n.r} fill={person.personId === me ? ME_COLOR : "white"} stroke={INK} strokeWidth={isSelected ? 4 : 2} />
              <text textAnchor="middle" dy="0.35em" fontSize={11} fontWeight={600} fill={INK} pointerEvents="none">
                {person.displayName.slice(0, 2)}
              </text>
              <text textAnchor="middle" y={n.r + 14} fontSize={12} fontWeight={600} fill={INK} pointerEvents="none" className="[paint-order:stroke] [stroke:#E9EDF1] [stroke-width:4px]">
                {person.displayName}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}
