"use client";

import { packSiblings } from "d3-hierarchy";
import { useMemo } from "react";
import type { Role } from "@/lib/types";
import { ROLE_ORDER, type PreviewTheme } from "./preview";
import { INK, OUTCOME, ROLE } from "./palette";

type Table = { theme: PreviewTheme; x: number; y: number; r: number };
type Seat = { personId: string; role: Role; x: number; y: number };

// Fixed radii (not a fill-the-box pack) so a table means the same size in every room and at every threshold.
function radiusOf(theme: PreviewTheme): number {
  return (34 + theme.personCount * 16) * (theme.outcome === "sin mesa" ? 0.8 : 1);
}

function layout(themes: PreviewTheme[]): Table[] {
  const circles = [...themes]
    .sort((a, b) => b.personCount - a.personCount || a.name.localeCompare(b.name))
    .map((theme) => ({ theme, x: 0, y: 0, r: radiusOf(theme) + 14 }));
  packSiblings(circles);
  return circles.map((c) => ({ ...c, r: c.r - 14 }));
}

// Average glyph width of the display face relative to font size; good enough to keep labels inside a table.
const GLYPH = 0.56;

function fitLabel(text: string, maxWidth: number, maxSize: number): { lines: string[]; size: number } {
  const oneLine = Math.min(maxSize, maxWidth / (text.length * GLYPH));
  const words = text.split(" ");
  if (oneLine >= maxSize * 0.75 || words.length === 1) return { lines: [text], size: oneLine };
  let best = [text, ""];
  for (let i = 1; i < words.length; i++) {
    const candidate = [words.slice(0, i).join(" "), words.slice(i).join(" ")];
    if (Math.max(...candidate.map((l) => l.length)) < Math.max(...best.map((l) => l.length))) best = candidate;
  }
  const longest = Math.max(...best.map((l) => l.length));
  return { lines: best, size: Math.min(maxSize, maxWidth / (longest * GLYPH)) };
}

function seatsOf(theme: PreviewTheme): Omit<Seat, "x" | "y">[] {
  const seats: Omit<Seat, "x" | "y">[] = [];
  for (const role of ROLE_ORDER) {
    for (const personId of theme.roles[role]) {
      if (!seats.some((s) => s.personId === personId)) seats.push({ personId, role });
    }
  }
  return seats;
}

export function FloorPlan({
  themes,
  names,
  selected,
  onSelect,
}: {
  themes: PreviewTheme[];
  names: Map<string, string>;
  selected?: string;
  onSelect: (personId?: string) => void;
}) {
  const tables = useMemo(() => layout(themes.filter((t) => t.personCount >= 2)), [themes]);

  if (tables.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="max-w-sm text-center font-heading text-2xl leading-snug font-semibold text-[#18212F]/70">
          Nadie comparte un tema con otra persona, así que esta sala no arma ninguna mesa.
        </p>
      </div>
    );
  }

  // Fit the viewBox to the packed tables so the plan fills the canvas whatever its aspect ratio.
  const margin = 16;
  const minX = Math.min(...tables.map((t) => t.x - t.r)) - margin;
  const minY = Math.min(...tables.map((t) => t.y - t.r)) - margin;
  const maxX = Math.max(...tables.map((t) => t.x + t.r)) + margin;
  const maxY = Math.max(...tables.map((t) => t.y + t.r)) + margin;
  // A lone table should look like one table in a room, not fill the screen.
  const minSide = 620;
  const padX = Math.max(0, minSide - (maxX - minX)) / 2;
  const padY = Math.max(0, minSide * 0.75 - (maxY - minY)) / 2;

  return (
    <svg
      viewBox={`${minX - padX} ${minY - padY} ${maxX - minX + 2 * padX} ${maxY - minY + 2 * padY}`}
      className="h-full w-full"
      role="group"
      aria-label="Plano de la sala: cada círculo es una mesa temática y cada asiento, una persona"
      onClick={() => onSelect(undefined)}
    >
      {tables.map((table) => (
        <TableView
          key={table.theme.id}
          table={table}
          names={names}
          selected={selected}
          onSelect={onSelect}
        />
      ))}
    </svg>
  );
}

function TableView({
  table,
  names,
  selected,
  onSelect,
}: {
  table: Table;
  names: Map<string, string>;
  selected?: string;
  onSelect: (personId?: string) => void;
}) {
  const { theme, x, y, r } = table;
  const style = OUTCOME[theme.outcome];
  const seatR = Math.min(17, Math.max(11, r * 0.19));
  const surface = r - seatR * 1.45;
  const seatRing = r - seatR;
  const seats = seatsOf(theme).map((seat, i, all): Seat => {
    const angle = (i / all.length) * Math.PI * 2 - Math.PI / 2;
    return { ...seat, x: Math.cos(angle) * seatRing, y: Math.sin(angle) * seatRing };
  });
  const hasSelected = selected !== undefined && seats.some((s) => s.personId === selected);
  const dim = selected !== undefined && !hasSelected;
  const merged = theme.topicNames.length > 1;
  const title = fitLabel(theme.name, surface * 1.6, Math.min(24, Math.max(12, surface * 0.24)));
  const detailSize = Math.max(9, Math.min(13, surface * 0.13));
  const statusSize = Math.min(detailSize, (surface * 1.5) / (style.label.length * GLYPH));
  const showStatus = theme.outcome !== "sin mesa" && statusSize >= 8;
  const others = theme.topicNames.filter((n) => n !== theme.name);
  const mergedText = others.join(", ");
  const mergedLabel =
    mergedText.length * GLYPH * detailSize <= surface * 1.6 ? mergedText : `y ${others.length} tópicos parecidos`;
  const showMerged = merged && surface > 44;
  const lineHeight = title.size * 1.1;
  const blockHeight = title.lines.length * lineHeight + (showMerged ? detailSize * 1.4 : 0) + (showStatus ? detailSize * 1.6 : 0);
  const top = -blockHeight / 2 + title.size * 0.8;

  return (
    <g
      className="transition-[transform,opacity] duration-500 ease-out motion-reduce:transition-none"
      style={{ transform: `translate(${x}px, ${y}px)`, opacity: dim ? 0.28 : 1 }}
    >
      <circle
        r={surface}
        fill="white"
        stroke={style.rim}
        strokeWidth={theme.outcome === "sin mesa" ? 1 : 2.5}
        strokeDasharray={theme.outcome === "sin mesa" ? "3 4" : undefined}
      />
      {theme.outcome !== "sin mesa" && <circle r={surface - 6} fill={style.wash} />}

      <text
        textAnchor="middle"
        fontSize={title.size}
        fontWeight={600}
        fill={INK}
        fillOpacity={theme.outcome === "sin mesa" ? 0.55 : 1}
        className="font-heading"
      >
        {title.lines.map((line, i) => (
          <tspan key={line} x={0} y={top + i * lineHeight}>
            {line}
          </tspan>
        ))}
      </text>
      {showMerged && (
        <text textAnchor="middle" y={top + (title.lines.length - 1) * lineHeight + detailSize * 1.5} fontSize={detailSize} fill={INK} fillOpacity={0.6}>
          {mergedLabel}
        </text>
      )}
      {showStatus && (
        <text
          textAnchor="middle"
          y={top + (title.lines.length - 1) * lineHeight + detailSize * (showMerged ? 3 : 1.7)}
          fontSize={statusSize}
          fontWeight={500}
          fill={style.text}
        >
          {style.label}
        </text>
      )}

      {seats.map((seat) => {
        const name = names.get(seat.personId) ?? seat.personId;
        const isSelected = seat.personId === selected;
        return (
          <g
            key={seat.personId}
            transform={`translate(${seat.x}, ${seat.y})`}
            role="button"
            tabIndex={0}
            aria-label={`${name}, ${seat.role} en ${theme.name}`}
            aria-pressed={isSelected}
            className="cursor-pointer outline-none [&:focus-visible>circle]:stroke-[#18212F]"
            onClick={(e) => {
              e.stopPropagation();
              onSelect(isSelected ? undefined : seat.personId);
            }}
            onKeyDown={(e) => {
              if (e.key !== "Enter" && e.key !== " ") return;
              e.preventDefault();
              onSelect(isSelected ? undefined : seat.personId);
            }}
          >
            <title>{`${name} · ${seat.role}`}</title>
            <circle
              r={isSelected ? seatR * 1.25 : seatR}
              fill={ROLE[seat.role].color}
              stroke={isSelected ? INK : "white"}
              strokeWidth={isSelected ? 3 : 2}
              opacity={selected !== undefined && !isSelected ? 0.35 : 1}
              className="transition-all duration-200 motion-reduce:transition-none"
            />
            <text
              textAnchor="middle"
              dy="0.35em"
              fontSize={seatR * 0.78}
              fontWeight={600}
              fill="white"
              pointerEvents="none"
              opacity={selected !== undefined && !isSelected ? 0.6 : 1}
            >
              {name.slice(0, 2)}
            </text>
          </g>
        );
      })}
    </g>
  );
}
