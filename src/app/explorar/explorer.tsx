"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/browser";
import type { PublicProjection, Role } from "@/lib/types";
import { FloorPlan } from "./floor-plan";
import { INK, KIND_LABEL, OUTCOME, ROLE, SOURCE_LABEL } from "./palette";
import { previewThemes, ROLE_ORDER, type PreviewTheme } from "./preview";

type Room = { id: string; code: string; name: string };

export function Explorer() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomId, setRoomId] = useState<string>();
  const [projections, setProjections] = useState<PublicProjection[]>([]);
  const [error, setError] = useState<string>();
  const [threshold, setThreshold] = useState(0.6);
  const [selected, setSelected] = useState<string>();

  useEffect(() => {
    supabase
      .from("rooms")
      .select("id, code, name")
      .order("id", { ascending: false })
      .then(({ data, error }) => {
        if (error) return setError(`No se pudieron leer las salas (${error.message})`);
        setRooms(data);
        setRoomId((current) => current ?? data[0]?.id);
      });
  }, []);

  useEffect(() => {
    if (!roomId) return;
    supabase
      .from("room_members")
      .select("projection")
      .eq("room_id", roomId)
      .order("display_name")
      .then(({ data, error }) => {
        if (error) return setError(`No se pudo leer la sala (${error.message})`);
        setProjections(data.map((row) => row.projection as PublicProjection));
      });
  }, [roomId]);

  const themes = useMemo(() => previewThemes(projections, threshold), [projections, threshold]);
  const names = useMemo(() => new Map(projections.map((p) => [p.personId, p.displayName])), [projections]);
  const person = projections.find((p) => p.personId === selected);
  const buildable = themes.filter((t) => t.outcome === "complemento").length;
  const affinity = themes.filter((t) => t.outcome === "afinidad").length;

  return (
    <div className="flex min-h-dvh flex-col bg-[#E9EDF1] text-[#18212F] lg:h-dvh lg:flex-row">
      <main
        className="relative flex-1 bg-[radial-gradient(rgba(24,33,47,0.12)_1px,transparent_1px)] bg-size-[24px_24px] p-4 lg:p-8"
        aria-label="Plano de la sala"
      >
        <div className="aspect-square max-h-[78dvh] w-full lg:aspect-auto lg:h-full lg:max-h-none">
          <FloorPlan themes={themes} names={names} selected={selected} onSelect={setSelected} />
        </div>
        <Legend />
      </main>

      <aside className="flex w-full flex-col gap-7 bg-white px-6 py-7 shadow-[-1px_0_0_rgba(24,33,47,0.08)] lg:w-[400px] lg:overflow-y-auto">
        <header className="flex flex-col gap-2">
          <h1 className="font-heading text-[2rem] leading-[1.05] font-semibold tracking-tight">Mapa de la sala</h1>
          <p className="text-[0.9375rem] leading-relaxed text-[#18212F]/70">
            Así ve la sala lo que cada persona publica: cada círculo es una mesa sobre un tema y cada asiento, alguien
            que puede sentarse ahí.
          </p>
        </header>

        {error && (
          <p role="alert" className="rounded-lg bg-[#FDECEC] px-4 py-3 text-sm text-[#8A1C1C]">
            {error}. Levanta Supabase con <code>pnpm db:start</code> y carga la sala con <code>pnpm seed</code>.
          </p>
        )}

        <RoomSwitch rooms={rooms} roomId={roomId} onChange={(id) => { setRoomId(id); setSelected(undefined); }} />

        <section className="flex flex-col gap-3" aria-labelledby="threshold-label">
          <div className="flex items-baseline justify-between">
            <label id="threshold-label" htmlFor="threshold" className="text-sm font-medium">
              Parecido mínimo para compartir mesa
            </label>
            <output htmlFor="threshold" className="font-heading text-2xl font-semibold tabular-nums">
              {threshold.toFixed(2).replace(".", ",")}
            </output>
          </div>
          <input
            id="threshold"
            type="range"
            min={0.3}
            max={0.95}
            step={0.01}
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
            className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-[#18212F]/12 accent-[#18212F] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#2F7FD1]"
          />
          <p className="text-[0.8125rem] leading-snug text-[#18212F]/60">
            Bájalo y escalada se junta con más cosas; súbelo y cada tópico queda en su propia mesa. El diseño parte en
            0,60.
          </p>
        </section>

        <dl className="grid grid-cols-3 border-y border-[#18212F]/10 py-5">
          <Figure value={projections.length} label="personas en la sala" />
          <Figure value={buildable} label="mesas con complemento: alguien aporta y alguien busca" tone={OUTCOME.complemento.text} />
          <Figure value={affinity} label="mesas de pura afinidad" tone={OUTCOME.afinidad.text} />
        </dl>

        <Loners themes={themes} names={names} />

        {person ? (
          <PersonDetail person={person} themes={themes} onClose={() => setSelected(undefined)} />
        ) : (
          <People projections={projections} onSelect={setSelected} />
        )}

        <p className="mt-auto pt-4 text-xs leading-relaxed text-[#18212F]/50">
          Una mesa se arma con 3 o más personas. Esta es una vista previa de temas y roles, calculada en tu navegador con los embeddings del seed. Las mesas finales las
          arma el motor de sala.
        </p>
      </aside>
    </div>
  );
}

function RoomSwitch({ rooms, roomId, onChange }: { rooms: Room[]; roomId?: string; onChange: (id: string) => void }) {
  return (
    <fieldset className="grid grid-cols-2 gap-1 rounded-xl bg-[#18212F]/6 p-1">
      <legend className="sr-only">Sala</legend>
      {rooms.map((room) => (
        <label
          key={room.id}
          className="flex cursor-pointer flex-col rounded-lg px-3 py-2 text-sm transition-colors has-checked:bg-white has-checked:shadow-[0_1px_2px_rgba(24,33,47,0.12)] has-focus-visible:outline-2 has-focus-visible:outline-[#2F7FD1]"
        >
          <input type="radio" name="room" className="sr-only" checked={room.id === roomId} onChange={() => onChange(room.id)} />
          <span className="font-medium">{room.name}</span>
          <span className="text-xs text-[#18212F]/55">código {room.code}</span>
        </label>
      ))}
    </fieldset>
  );
}

function Figure({ value, label, tone = INK }: { value: number; label: string; tone?: string }) {
  return (
    <div className="flex flex-col gap-1 pr-3">
      <dd className="font-heading text-4xl leading-none font-semibold tabular-nums" style={{ color: tone }}>
        {value}
      </dd>
      <dt className="text-xs leading-snug text-[#18212F]/60">{label}</dt>
    </div>
  );
}

function Loners({ themes, names }: { themes: PreviewTheme[]; names: Map<string, string> }) {
  const loners = themes.filter((t) => t.personCount === 1);
  if (loners.length === 0) return null;
  return (
    <section className="flex flex-col gap-2" aria-labelledby="loners-heading">
      <h2 id="loners-heading" className="text-sm font-medium">
        Tópicos que nadie más tiene en la sala
      </h2>
      <p className="text-[0.8125rem] leading-relaxed text-[#18212F]/65">
        {loners
          .map((t) => {
            const owner = ROLE_ORDER.flatMap((r) => t.roles[r])[0];
            return `${t.name} (${names.get(owner) ?? owner})`;
          })
          .join(", ")}
      </p>
    </section>
  );
}

function People({ projections, onSelect }: { projections: PublicProjection[]; onSelect: (id: string) => void }) {
  if (projections.length === 0) return null;
  return (
    <section className="flex flex-col gap-3" aria-labelledby="people-heading">
      <h2 id="people-heading" className="text-sm font-medium">
        Elige a alguien para ver dónde se sienta
      </h2>
      <ul className="flex flex-wrap gap-1.5">
        {projections.map((p) => (
          <li key={p.personId}>
            <button
              type="button"
              onClick={() => onSelect(p.personId)}
              className="rounded-full border border-[#18212F]/15 px-3 py-1 text-sm transition-colors hover:border-[#18212F] hover:bg-[#18212F] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2F7FD1]"
            >
              {p.displayName}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function PersonDetail({
  person,
  themes,
  onClose,
}: {
  person: PublicProjection;
  themes: PreviewTheme[];
  onClose: () => void;
}) {
  const seats = themes
    .map((theme) => ({ theme, role: ROLE_ORDER.find((r) => theme.roles[r].includes(person.personId)) }))
    .filter((s): s is { theme: PreviewTheme; role: Role } => s.role !== undefined);

  return (
    <section className="flex flex-col gap-5" aria-labelledby="person-heading">
      <div className="flex items-baseline justify-between">
        <h2 id="person-heading" className="font-heading text-2xl font-semibold">
          {person.displayName}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="text-sm text-[#18212F]/60 underline-offset-4 hover:text-[#18212F] hover:underline focus-visible:outline-2 focus-visible:outline-[#2F7FD1]"
        >
          Ver a todos
        </button>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">Se puede sentar en</h3>
        <ul className="flex flex-col gap-1.5">
          {seats.map(({ theme, role }) => (
            <li key={theme.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="flex items-center gap-2">
                <span className="size-2.5 rounded-full" style={{ background: ROLE[role].color }} />
                {theme.name}
              </span>
              <span className="text-xs" style={{ color: theme.outcome === "sin mesa" ? "rgba(24,33,47,0.45)" : ROLE[role].color }}>
                {theme.outcome === "sin mesa" ? `${ROLE[role].label.toLowerCase()}, no se arma` : ROLE[role].label.toLowerCase()}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">Lo que publica</h3>
        <ul className="divide-y divide-[#18212F]/8">
          {person.topics.map((topic) => (
            <li key={topic.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span>
                <span className="text-[#18212F]/55">{KIND_LABEL[topic.kind]} </span>
                {topic.name}
              </span>
              <span className="flex shrink-0 items-center gap-3 text-xs text-[#18212F]/55">
                {topic.sources.map((s) => SOURCE_LABEL[s]).join(", ")}
                <Depth value={topic.depth} />
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Depth({ value }: { value: 1 | 2 | 3 }) {
  return (
    <span className="flex gap-0.5" aria-label={`profundidad ${value} de 3`}>
      {[1, 2, 3].map((level) => (
        <span key={level} className="size-1.5 rounded-full" style={{ background: level <= value ? INK : "rgba(24,33,47,0.15)" }} />
      ))}
    </span>
  );
}

function Legend() {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-[#18212F]/75 lg:pointer-events-none lg:absolute lg:bottom-6 lg:left-8 lg:mt-0">
      {ROLE_ORDER.map((role) => (
        <span key={role} className="flex items-center gap-1.5">
          <span className="size-3 rounded-full border-2 border-white" style={{ background: ROLE[role].color }} />
          <span>
            <span className="font-medium text-[#18212F]">{ROLE[role].label}</span> {ROLE[role].hint}
          </span>
        </span>
      ))}
      <span className="flex items-center gap-1.5">
        <span className="size-3 rounded-full border border-dashed border-[#18212F]/50 bg-white" />
        Mesa que no se arma
      </span>
    </div>
  );
}
