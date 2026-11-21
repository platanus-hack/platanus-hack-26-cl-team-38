"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { supabase } from "@/lib/supabase/browser";
import type { PublicProjection } from "@/lib/types";
import { INK, OUTCOME, ROLE, SOURCE_LABEL } from "../explorar/palette";
import { previewThemes, type PreviewTheme } from "../explorar/preview";
import { ForceGraph, LINK_STYLE, ME_COLOR, type Focus } from "./force-graph";
import { filterGraph, topicGraph, type LinkType } from "./graph";

type Room = { id: string; code: string; name: string };
type Membership = { room_id: string; person_id: string; display_name: string };

const LINK_TYPES = Object.keys(LINK_STYLE) as LinkType[];

// No login in the hack: "who am I" is a per-browser choice.
const ME_KEY = "team38.me";
const meListeners = new Set<() => void>();
function subscribeMe(listener: () => void) {
  meListeners.add(listener);
  return () => meListeners.delete(listener);
}
function setStoredMe(personId?: string) {
  if (personId) localStorage.setItem(ME_KEY, personId);
  else localStorage.removeItem(ME_KEY);
  meListeners.forEach((l) => l());
}
function useMe() {
  return useSyncExternalStore(subscribeMe, () => localStorage.getItem(ME_KEY) ?? undefined, () => undefined);
}

export function GraphExplorer() {
  const me = useMe();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [pickedRoom, setPickedRoom] = useState<string>();
  const [projections, setProjections] = useState<PublicProjection[]>([]);
  const [error, setError] = useState<string>();
  const [threshold, setThreshold] = useState(0.6);
  const [onlyMyRooms, setOnlyMyRooms] = useState(false);
  const [onlyMine, setOnlyMine] = useState(false);
  const [types, setTypes] = useState(new Set<LinkType>(LINK_TYPES));
  const [selectedPerson, setSelectedPerson] = useState<string>();
  const [selectedTheme, setSelectedTheme] = useState<string>();

  useEffect(() => {
    Promise.all([
      supabase.from("rooms").select("id, code, name").order("id", { ascending: false }),
      supabase.from("room_members").select("room_id, person_id, display_name").order("display_name"),
    ]).then(([roomsRes, membersRes]) => {
      if (roomsRes.error || membersRes.error) {
        return setError(`No se pudieron leer las salas (${(roomsRes.error ?? membersRes.error)!.message})`);
      }
      setRooms(roomsRes.data);
      setMemberships(membersRes.data);
    });
  }, []);

  const everyone = useMemo(() => {
    const byId = new Map(memberships.map((m) => [m.person_id, m.display_name]));
    return [...byId].map(([personId, displayName]) => ({ personId, displayName })).sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [memberships]);
  const myRoomIds = useMemo(() => new Set(memberships.filter((m) => m.person_id === me).map((m) => m.room_id)), [memberships, me]);
  const visibleRooms = onlyMyRooms && me ? rooms.filter((r) => myRoomIds.has(r.id)) : rooms;
  const roomId = visibleRooms.some((r) => r.id === pickedRoom) ? pickedRoom : visibleRooms[0]?.id;

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

  const meHere = me !== undefined && projections.some((p) => p.personId === me);
  const egoOn = onlyMine && meHere;
  const full = useMemo(() => topicGraph(projections, threshold), [projections, threshold]);
  const graph = useMemo(() => filterGraph(full, { me: egoOn ? me : undefined, types }), [full, egoOn, me, types]);
  const linked = useMemo(() => new Set(graph.links.flatMap((l) => [l.source, l.target])), [graph]);
  const nodes = useMemo(() => graph.nodes.filter((n) => linked.has(n.id) || (egoOn && n.personId === me)), [graph, linked, egoOn, me]);
  const people = useMemo(() => {
    const shown = new Set(nodes.map((n) => n.personId));
    return projections
      .filter((p) => !egoOn || shown.has(p.personId) || p.personId === me)
      .map((p) => ({ personId: p.personId, displayName: p.displayName }));
  }, [projections, nodes, egoOn, me]);
  const names = useMemo(() => new Map(projections.map((p) => [p.personId, p.displayName])), [projections]);

  const themes = useMemo(() => {
    const all = previewThemes(projections, threshold).filter((t) => t.personCount >= 2);
    return egoOn ? all.filter((t) => peopleOf(t).includes(me!)) : all;
  }, [projections, threshold, egoOn, me]);
  const theme = themes.find((t) => t.id === selectedTheme);

  const focus: Focus = useMemo(() => {
    if (theme) {
      const names = new Set(theme.topicNames);
      return { nodeIds: new Set([...graph.nodes.filter((n) => names.has(n.name)).map((n) => n.id), ...peopleOf(theme).map((p) => `person:${p}`)]) };
    }
    if (!selectedPerson) return undefined;
    const own = new Set(graph.nodes.filter((n) => n.personId === selectedPerson).map((n) => n.id));
    const owner = new Map(graph.nodes.map((n) => [n.id, n.personId]));
    const ids = new Set([`person:${selectedPerson}`, ...own]);
    for (const l of graph.links) {
      if (!own.has(l.source) && !own.has(l.target)) continue;
      ids.add(l.source).add(l.target).add(`person:${owner.get(l.source)}`).add(`person:${owner.get(l.target)}`);
    }
    return { nodeIds: ids };
  }, [graph, selectedPerson, theme]);

  const counts = Object.fromEntries(LINK_TYPES.map((t) => [t, graph.links.filter((l) => l.type === t).length])) as Record<LinkType, number>;

  const clearSelection = () => {
    setSelectedPerson(undefined);
    setSelectedTheme(undefined);
  };

  return (
    <div className="flex min-h-dvh flex-col bg-[#E9EDF1] text-[#18212F] lg:h-dvh lg:flex-row">
      <main
        className="relative flex-1 bg-[radial-gradient(rgba(24,33,47,0.12)_1px,transparent_1px)] bg-size-[24px_24px]"
        aria-label="Grafo de la sala"
      >
        <div className="aspect-square max-h-[78dvh] w-full lg:aspect-auto lg:h-full lg:max-h-none">
          {people.length > 0 && (
            <ForceGraph
              key={roomId}
              people={people}
              nodes={nodes}
              links={graph.links}
              focus={focus}
              me={me}
              selectedPerson={selectedPerson}
              onSelectPerson={(id) => {
                setSelectedPerson(id);
                setSelectedTheme(undefined);
              }}
            />
          )}
        </div>
        <Legend />
      </main>

      <aside className="flex w-full flex-col gap-6 bg-white px-6 py-7 shadow-[-1px_0_0_rgba(24,33,47,0.08)] lg:w-[400px] lg:overflow-y-auto">
        <header className="flex flex-col gap-2">
          <h1 className="font-heading text-[2rem] leading-[1.05] font-semibold tracking-tight">Grafo de la sala</h1>
          <p className="text-[0.9375rem] leading-relaxed text-[#18212F]/70">
            Cada persona y sus tópicos públicos, coloreados por el rol que le dan. Dos tópicos de personas distintas se
            enlazan si se parecen; los grupos enlazados son los temas donde se arman las mesas.
          </p>
          <p className="text-xs text-[#18212F]/55">
            Arrastra nodos, rueda para zoom, arrastra el fondo para moverte.{" "}
            <Link href="/explorar" className="underline underline-offset-2">
              Ver el plano de mesas
            </Link>
          </p>
        </header>

        {error && (
          <p role="alert" className="rounded-lg bg-[#FDECEC] px-4 py-3 text-sm text-[#8A1C1C]">
            {error}. Levanta Supabase con <code>pnpm db:start</code> y carga la sala con <code>pnpm seed</code>.
          </p>
        )}

        <section className="flex flex-col gap-3 rounded-xl bg-[#F2B84B]/12 p-4">
          <label className="flex items-center justify-between gap-3 text-sm font-medium">
            Soy
            <select
              value={me ?? ""}
              onChange={(e) => {
                setStoredMe(e.target.value || undefined);
                clearSelection();
              }}
              className="flex-1 rounded-lg border border-[#18212F]/15 bg-white px-3 py-1.5 text-sm"
            >
              <option value="">Nadie en particular</option>
              {everyone.map((p) => (
                <option key={p.personId} value={p.personId}>
                  {p.displayName}
                </option>
              ))}
            </select>
          </label>
          <Toggle checked={onlyMyRooms} disabled={!me} onChange={setOnlyMyRooms}>
            Solo las salas donde estoy {me && `(${myRoomIds.size} de ${rooms.length})`}
          </Toggle>
          <Toggle checked={onlyMine} disabled={!meHere} onChange={setOnlyMine}>
            Solo mis conexiones {me && !meHere && "(no estás en esta sala)"}
          </Toggle>
          <fieldset className="flex flex-wrap gap-1.5">
            <legend className="mb-1.5 text-xs text-[#18212F]/60">Tipos de conexión</legend>
            {LINK_TYPES.map((type) => (
              <label
                key={type}
                className="flex cursor-pointer items-center gap-1.5 rounded-full border border-[#18212F]/15 bg-white px-3 py-1 text-sm has-checked:border-transparent has-checked:text-white"
                style={types.has(type) ? { background: LINK_STYLE[type].color } : undefined}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={types.has(type)}
                  onChange={(e) => {
                    const next = new Set(types);
                    if (e.target.checked) next.add(type);
                    else next.delete(type);
                    setTypes(next);
                  }}
                />
                {type} · {counts[type]}
              </label>
            ))}
          </fieldset>
        </section>

        <fieldset className="grid grid-cols-2 gap-1 rounded-xl bg-[#18212F]/6 p-1">
          <legend className="sr-only">Sala</legend>
          {visibleRooms.map((room) => (
            <label
              key={room.id}
              className="flex cursor-pointer flex-col rounded-lg px-3 py-2 text-sm transition-colors has-checked:bg-white has-checked:shadow-[0_1px_2px_rgba(24,33,47,0.12)]"
            >
              <input
                type="radio"
                name="room"
                className="sr-only"
                checked={room.id === roomId}
                onChange={() => {
                  setPickedRoom(room.id);
                  clearSelection();
                }}
              />
              <span className="font-medium">
                {room.name}
                {myRoomIds.has(room.id) && <span className="ml-1.5 inline-block size-2 rounded-full align-middle" style={{ background: ME_COLOR }} />}
              </span>
              <span className="text-xs text-[#18212F]/55">código {room.code}</span>
            </label>
          ))}
        </fieldset>

        <section className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <label htmlFor="threshold" className="text-sm font-medium">
              Parecido mínimo para enlazar
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
            className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-[#18212F]/12 accent-[#18212F]"
          />
        </section>

        <dl className="grid grid-cols-3 border-y border-[#18212F]/10 py-5">
          <Figure value={people.length} label={egoOn ? "personas conectadas contigo" : "personas en la sala"} />
          <Figure value={counts.complemento} label="complemento" tone={LINK_STYLE.complemento.color} />
          <Figure value={counts.afinidad} label="afinidad" tone={LINK_STYLE.afinidad.color} />
        </dl>

        {selectedPerson ? (
          <PersonPanel
            person={projections.find((p) => p.personId === selectedPerson)!}
            themes={themes.filter((t) => peopleOf(t).includes(selectedPerson))}
            onClose={() => setSelectedPerson(undefined)}
            onPickTheme={(id) => {
              setSelectedPerson(undefined);
              setSelectedTheme(id);
            }}
          />
        ) : (
          <ThemeList themes={themes} names={names} selected={selectedTheme} onSelect={setSelectedTheme} />
        )}
      </aside>
    </div>
  );
}

function peopleOf(theme: PreviewTheme): string[] {
  return [...new Set(Object.values(theme.roles).flat())];
}

function Toggle({ checked, disabled, onChange, children }: { checked: boolean; disabled?: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="flex items-center gap-2 text-sm has-disabled:opacity-45">
      <input type="checkbox" checked={checked && !disabled} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="accent-[#18212F]" />
      {children}
    </label>
  );
}

function ThemeList({
  themes,
  names,
  selected,
  onSelect,
}: {
  themes: PreviewTheme[];
  names: Map<string, string>;
  selected?: string;
  onSelect: (id?: string) => void;
}) {
  if (themes.length === 0) {
    return <p className="text-sm text-[#18212F]/65">Nadie comparte un tema con otra persona.</p>;
  }
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-medium">Temas con 2 o más personas</h2>
      <ul className="flex flex-col gap-1">
        {themes.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              onClick={() => onSelect(t.id === selected ? undefined : t.id)}
              aria-pressed={t.id === selected}
              className="group flex w-full flex-col items-start rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-[#18212F]/5 aria-pressed:bg-[#18212F] aria-pressed:text-white"
            >
              <span className="flex w-full justify-between gap-2 font-medium">
                {t.name}
                <span className="text-xs font-normal group-aria-pressed:text-white" style={{ color: OUTCOME[t.outcome].text }}>
                  {OUTCOME[t.outcome].label} · {t.personCount}
                </span>
              </span>
              <span className="text-xs opacity-65">{peopleOf(t).map((p) => names.get(p) ?? p).join(", ")}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function PersonPanel({
  person,
  themes,
  onClose,
  onPickTheme,
}: {
  person: PublicProjection;
  themes: PreviewTheme[];
  onClose: () => void;
  onPickTheme: (id: string) => void;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <h2 className="font-heading text-2xl font-semibold">{person.displayName}</h2>
        <button type="button" onClick={onClose} className="text-sm text-[#18212F]/60 underline-offset-4 hover:underline">
          Ver a todos
        </button>
      </div>
      <div className="flex flex-col gap-1.5">
        <h3 className="text-sm font-medium">Está en {themes.length} temas compartidos</h3>
        <ul className="flex flex-wrap gap-1.5">
          {themes.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => onPickTheme(t.id)}
                className="rounded-full border border-[#18212F]/15 px-3 py-1 text-sm hover:border-[#18212F] hover:bg-[#18212F] hover:text-white"
              >
                {t.name} · {t.personCount}
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex flex-col gap-1.5">
        <h3 className="text-sm font-medium">Su proyección pública</h3>
        <ul className="divide-y divide-[#18212F]/8">
          {person.topics.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span>{t.name}</span>
              <span className="text-xs text-[#18212F]/55">
                {t.kind.replace("_", " ")} · {t.sources.map((s) => SOURCE_LABEL[s]).join(", ")} · {"●".repeat(t.depth)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Figure({ value, label, tone = INK }: { value: number; label: string; tone?: string }) {
  return (
    <div className="flex flex-col gap-1 pr-2">
      <dd className="font-heading text-3xl leading-none font-semibold tabular-nums" style={{ color: tone }}>
        {value}
      </dd>
      <dt className="text-xs leading-snug text-[#18212F]/60">{label}</dt>
    </div>
  );
}

function Legend() {
  return (
    <div className="pointer-events-none flex flex-wrap items-center gap-x-5 gap-y-2 px-4 pb-4 text-xs text-[#18212F]/75 lg:absolute lg:bottom-6 lg:left-20 lg:p-0">
      {(["aporta", "comparte"] as const).map((role) => (
        <span key={role} className="flex items-center gap-1.5">
          <span className="size-3 rounded-full" style={{ background: ROLE[role].color }} /> {ROLE[role].label.toLowerCase()}
        </span>
      ))}
      <span className="flex items-center gap-1.5">
        <span className="size-3 rounded-full bg-white" style={{ border: `2px dashed ${ROLE.busca.color}` }} /> busca
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-3 rounded-full border-2" style={{ background: ME_COLOR, borderColor: INK }} /> tú
      </span>
      {LINK_TYPES.map((type) => (
        <span key={type} className="flex items-center gap-1.5">
          <svg width="22" height="6" aria-hidden>
            <line x1="0" y1="3" x2="22" y2="3" stroke={LINK_STYLE[type].color} strokeWidth="2.5" />
          </svg>
          {LINK_STYLE[type].label}
        </span>
      ))}
    </div>
  );
}
