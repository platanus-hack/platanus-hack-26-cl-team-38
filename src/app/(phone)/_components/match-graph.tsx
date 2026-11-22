"use client";

import { type Edge, type Entity, GraphCanvas, onEllipse, pose } from "./graph-canvas";
import { cap, type TopicGroup } from "../_lib/people";
import { setPhone } from "../_lib/store";

// Coincidencias by topic: you in the middle, the topics you share with people around you. Tap a
// topic and it moves to the center with the people who share it; tap a person to see their summary.

type Me = { id: string; name: string };
type Focus = { topic: string | null; person: string | null };

const short = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function setFocus(focus: Partial<Focus>) {
  setPhone((p) => ({ focus: { ...p.focus, ...focus } }));
}

function matchScene(W: number, H: number, me: Me, groups: TopicGroup[], focus: Focus, compact: boolean) {
  const E: Record<string, Entity> = {};
  const edges: Edge[] = [];
  const cx = W / 2;
  const cy = H / 2;
  const shown = groups.slice(0, compact ? 8 : 12);
  const selected = shown.find((g) => g.topic === focus.topic);
  const hub = { x: cx, y: selected ? cy - H * 0.04 : cy };

  E[me.id] = {
    kind: "person",
    name: "Tú",
    me: true,
    pose: selected ? pose({ x: cx, y: H - 40 }, 1, 0.85) : pose({ x: cx, y: cy }, 1, compact ? 1 : 1.2),
  };

  shown.forEach((g, i) => {
    const id = `t:${g.topic}`;
    const isSel = g === selected;
    // Staggered radii so neighbors near the top and bottom don't overlap.
    const k = i % 2 ? 1.1 : 0.86;
    const ring = onEllipse(
      i,
      shown.length,
      W * (compact ? 0.3 : 0.34),
      H * (compact ? 0.36 : 0.36) * k,
      cx,
      cy,
      -90,
      270,
    );
    E[id] = {
      kind: "chip",
      cls: isSel ? "sel" : selected ? "off" : "",
      label: cap(short(g.topic, compact && !isSel ? 14 : 30)),
      // Up to three faces under the name, the rest as a count. Open, the people are around it instead.
      n: !isSel && g.people.length > 3 ? g.people.length - 3 : undefined,
      faces: isSel ? undefined : g.people.slice(0, 3).map((c) => c.person.personId),
      onClick: () => setFocus({ topic: isSel ? null : g.topic, person: null }),
      from: me.id,
      pose: isSel ? pose(hub) : pose(ring, selected ? 0.2 : 1),
    };
    // A dot runs from you to each topic; with one open, only along that line.
    edges.push({
      a: me.id,
      b: id,
      kind: isSel ? "strong" : "soft",
      o: selected && !isSel ? 0.25 : 1,
      pulse: !selected || isSel ? i : undefined,
    });
  });

  if (selected) {
    const people = selected.people.slice(0, compact ? 8 : 10);
    people.forEach((c, i) => {
      const id = `p:${c.person.personId}`;
      const r = Math.min(W, H) * (compact ? 0.36 : 0.32);
      const at = onEllipse(i, people.length, r * (W > H ? 1.5 : 1), r * 0.92, hub.x, hub.y, -195, 15);
      const isFocus = focus.person === c.person.personId;
      E[id] = {
        kind: "person",
        name: c.person.displayName,
        avatar: c.person.personId,
        focus: isFocus,
        tone: c.relation,
        onClick: () => setFocus({ person: c.person.personId }),
        from: `t:${selected.topic}`,
        pose: pose(at, 1, isFocus ? 1.12 : 0.95),
      };
      edges.push({
        a: `t:${selected.topic}`,
        b: id,
        kind: isFocus ? "focus" : "strong",
        w: isFocus ? 2 : 1.5,
        pulse: i + 1,
      });
    });
  }
  return { E, edges };
}

export function MatchGraph({
  W,
  H,
  me,
  groups,
  focus,
  compact = false,
}: {
  W: number;
  H: number;
  me: Me;
  groups: TopicGroup[];
  focus: Focus;
  compact?: boolean;
}) {
  const { E, edges } = matchScene(W, H, me, groups, focus, compact);
  return (
    <GraphCanvas
      W={W}
      H={H}
      E={E}
      edges={edges}
      onBackground={() => setFocus({ topic: null, person: null })}
      draggable
    />
  );
}
