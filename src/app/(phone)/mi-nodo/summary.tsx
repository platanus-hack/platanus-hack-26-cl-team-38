"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type ReactNode } from "react";
import { z } from "zod";
import { KIND_LABEL, ROLE, SOURCE_LABEL } from "@/app/explorar/palette";
import { rolesOf } from "@/app/explorar/preview";
import { fetchVerdicts, type ClassifyInput } from "@/lib/privacy/client";
import { KindSchema, type Kind, type PersonalNode, type Topic, type TopicPrivacy } from "@/lib/types";
import { buildNode, editTopic, setShared, shareGeneral, shareRecommended } from "@/lib/node/node";
import type { SeedPerson } from "./seed-source";
import { checkInBody, summarize, WITHHELD_COPY, type Summary as SummaryData } from "./summary-model";

// Same key as /grafo's "Soy": checking in as someone makes the other views open as them.
const ME_KEY = "team38.me";
// Limit of POST /api/checkin.
const MAX_NAME_LENGTH = 80;

const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2F7FD1]";

type Notice = { tone: "info" | "error"; text: string };

const CheckInResponseSchema = z.object({
  roomId: z.string(),
  accepted: z.array(z.string()),
  rejected: z.array(z.object({ topicId: z.string(), reason: z.string() })),
});

const normalizeName = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ");

export function Summary({ people }: { people: SeedPerson[] }) {
  const router = useRouter();
  const [person, setPerson] = useState<SeedPerson>();
  const [node, setNode] = useState<PersonalNode>();
  const [roomCode, setRoomCode] = useState<string>();
  const [loading, setLoading] = useState(false);
  // A topic id while that topic is being re-checked, or "checkin". Everything else waits.
  const [busy, setBusy] = useState<string>();
  const [editing, setEditing] = useState<string>();
  const [notice, setNotice] = useState<Notice>();
  const [roomHref, setRoomHref] = useState<string>();
  const latestPick = useRef(0);

  const summary = node && summarize(node);
  const locked = loading || busy !== undefined;
  const room = person?.rooms.find((r) => r.code === roomCode);

  async function pick(personId: string) {
    const next = people.find((p) => p.personId === personId);
    const ticket = ++latestPick.current;
    setPerson(next);
    setNode(undefined);
    setEditing(undefined);
    setNotice(undefined);
    setRoomHref(undefined);
    setRoomCode(next?.rooms[0]?.code);
    if (!next) return;

    setLoading(true);
    try {
      const verdicts = await fetchVerdicts(next.topics.map(({ kind, name, sources }) => ({ kind, name, sources })));
      if (ticket === latestPick.current) setNode(buildNode(next, next.topics, verdicts));
    } catch {
      if (ticket === latestPick.current)
        setNotice({ tone: "error", text: "No pudimos revisar tus tópicos. Intenta de nuevo en un rato." });
    } finally {
      if (ticket === latestPick.current) setLoading(false);
    }
  }

  // Edits and general versions need a fresh verdict before they touch the node.
  async function withVerdict(
    topicId: string,
    input: ClassifyInput,
    apply: (verdict: TopicPrivacy) => PersonalNode | { error: string },
  ) {
    setBusy(topicId);
    setNotice(undefined);
    try {
      const [verdict] = await fetchVerdicts([input]);
      const result = apply(verdict);
      if ("error" in result) {
        setNotice({ tone: "error", text: result.error });
        return false;
      }
      setNode(result);
      return true;
    } catch {
      setNotice({ tone: "error", text: "No pudimos revisarlo ahora. Intenta de nuevo." });
      return false;
    } finally {
      setBusy(undefined);
    }
  }

  async function saveEdit(topic: Topic, change: { name: string; kind: Kind }) {
    if (!node) return;
    const name = normalizeName(change.name);
    if (!name) return setNotice({ tone: "error", text: "El tópico necesita un nombre." });
    if (name === topic.name && change.kind === topic.kind) return setEditing(undefined);
    const saved = await withVerdict(topic.id, { kind: change.kind, name, sources: topic.sources }, (v) =>
      editTopic(node, topic.id, { name, kind: change.kind }, v),
    );
    if (saved) setEditing(undefined);
  }

  function shareGeneralVersion(topic: Topic) {
    const name = topic.privacy?.saferName;
    if (!node || !name) return;
    void withVerdict(topic.id, { kind: topic.kind, name, sources: topic.sources }, (v) =>
      shareGeneral(node, topic.id, v),
    );
  }

  async function checkIn() {
    if (!node || !roomCode) return;
    setBusy("checkin");
    setNotice(undefined);
    try {
      const response = await fetch("/api/checkin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(checkInBody(node, roomCode)),
      });
      const json: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message = z.object({ error: z.string() }).safeParse(json);
        return setNotice({
          tone: "error",
          text: `No pudimos entrarte a la sala${message.success ? `: ${message.data.error}` : "."}`,
        });
      }
      const result = CheckInResponseSchema.parse(json);
      try {
        localStorage.setItem(ME_KEY, node.personId);
      } catch {
        // Private mode or blocked storage: the other views just will not preselect you.
      }
      const href = `/explorar?sala=${encodeURIComponent(roomCode)}&persona=${encodeURIComponent(node.personId)}`;
      if (result.rejected.length === 0) return router.push(href);

      // The server classifies again and can disagree: those topics go back to private here too.
      const names = result.rejected.map((r) => node.topics.find((t) => t.id === r.topicId)?.name).filter(Boolean);
      setNode(result.rejected.reduce((n, r) => setShared(n, r.topicId, false), node));
      setNotice({
        tone: "info",
        text: `Entraste a la sala, pero el servidor dejó fuera ${names.length === 1 ? "un tópico" : `${names.length} tópicos`}: ${names.join(", ")}. Ahora están en privado.`,
      });
      setRoomHref(href);
    } catch {
      setNotice({ tone: "error", text: "No pudimos entrarte a la sala. Intenta de nuevo." });
    } finally {
      setBusy(undefined);
    }
  }

  const rowProps = (topic: Topic) => ({
    topic,
    withheld: summary?.withheld.get(topic.id),
    editing: editing === topic.id,
    busy: busy === topic.id,
    locked,
    onEdit: () => setEditing(topic.id),
    onCancel: () => setEditing(undefined),
    onSave: (change: { name: string; kind: Kind }) => saveEdit(topic, change),
  });

  return (
    <div className="min-h-dvh bg-[#E9EDF1] text-[#18212F]">
      <main className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 pt-8 pb-44">
        <header className="flex flex-col gap-3">
          <h1 className="font-heading text-[2rem] leading-[1.05] font-semibold tracking-tight">Así te ve la sala</h1>
          <p className="text-[0.9375rem] leading-relaxed text-[#18212F]/70">
            Todo parte privado. Lo que compartas aparece en el proyector con tu nombre, así que comparte lo que dirías
            en voz alta.
          </p>
          <label className="flex items-center justify-between gap-3 rounded-xl bg-[#F2B84B]/12 p-4 text-sm font-medium">
            Soy
            <select
              value={person?.personId ?? ""}
              onChange={(e) => void pick(e.target.value)}
              className={`flex-1 rounded-lg border border-[#18212F]/15 bg-white px-3 py-1.5 text-sm ${FOCUS}`}
            >
              <option value="">Elige a alguien del seed</option>
              {people.map((p) => (
                <option key={p.personId} value={p.personId}>
                  {p.displayName}
                </option>
              ))}
            </select>
          </label>
        </header>

        {loading && (
          <p role="status" className="rounded-xl bg-white px-4 py-3 text-sm text-[#18212F]/70">
            Revisando cuáles conviene compartir…
          </p>
        )}

        {notice && (
          <div
            role={notice.tone === "error" ? "alert" : "status"}
            className={`flex flex-col gap-2 rounded-xl px-4 py-3 text-sm ${notice.tone === "error" ? "bg-[#FDECEC] text-[#8A1C1C]" : "bg-white"}`}
          >
            <p>{notice.text}</p>
            {roomHref && (
              <button
                type="button"
                onClick={() => router.push(roomHref)}
                className={`self-start font-medium underline underline-offset-4 ${FOCUS}`}
              >
                Ir a la sala
              </button>
            )}
          </div>
        )}

        {node && summary && (
          <>
            <Preview summary={summary} />

            <Pile
              title="Recomendado para compartir"
              hint="Lo que sabes, haces o te gusta, dicho en general."
              action={<ShareAll summary={summary} locked={locked} onShare={() => setNode(shareRecommended(node))} />}
              empty="Nada por aquí."
            >
              {summary.recommended.map((topic) => (
                <TopicRow key={topic.id} {...rowProps(topic)}>
                  <Switch
                    label={`Compartir ${topic.name}`}
                    checked={topic.public}
                    disabled={locked}
                    onChange={(on) => setNode(setShared(node, topic.id, on))}
                  />
                </TopicRow>
              ))}
            </Pile>

            <Pile
              title="Tú decides"
              hint="Queda privado hasta que lo compartas, uno por uno."
              empty="Nada que decidir: todo lo tuyo es para compartir."
            >
              {summary.decide.map((topic) => (
                <TopicRow key={topic.id} {...rowProps(topic)} reason={topic.privacy?.reason} actionsBelow>
                  <Decision
                    topic={topic}
                    locked={locked}
                    onShare={() => setNode(setShared(node, topic.id, true))}
                    onKeep={() => setNode(setShared(node, topic.id, false))}
                    onShareGeneral={() => shareGeneralVersion(topic)}
                  />
                </TopicRow>
              ))}
            </Pile>
          </>
        )}
      </main>

      {node && summary && person && (
        <footer className="fixed inset-x-0 bottom-0 border-t border-[#18212F]/10 bg-white/95 backdrop-blur">
          <div className="mx-auto flex w-full max-w-md flex-col gap-3 px-4 py-4">
            {person.rooms.length > 1 && (
              <fieldset className="grid grid-cols-2 gap-1 rounded-xl bg-[#18212F]/6 p-1">
                <legend className="sr-only">Sala</legend>
                {person.rooms.map((r) => (
                  <label
                    key={r.code}
                    className="flex cursor-pointer flex-col rounded-lg px-3 py-1.5 text-sm has-checked:bg-white has-checked:shadow-[0_1px_2px_rgba(24,33,47,0.12)] has-focus-visible:outline-2 has-focus-visible:outline-[#2F7FD1]"
                  >
                    <input
                      type="radio"
                      name="room"
                      className="sr-only"
                      checked={r.code === roomCode}
                      onChange={() => setRoomCode(r.code)}
                    />
                    <span className="truncate font-medium">{r.name}</span>
                    <span className="text-xs text-[#18212F]/55">código {r.code}</span>
                  </label>
                ))}
              </fieldset>
            )}
            <button
              type="button"
              onClick={() => void checkIn()}
              disabled={locked || summary.shared.length === 0 || !room}
              className={`rounded-xl bg-[#18212F] px-4 py-3 text-[0.9375rem] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS}`}
            >
              {busy === "checkin" ? "Entrando…" : `Entrar a ${room?.name ?? "la sala"}`}
            </button>
            {summary.shared.length === 0 && (
              <p className="text-center text-xs text-[#18212F]/55">Comparte al menos un tópico para entrar.</p>
            )}
          </div>
        </footer>
      )}
    </div>
  );
}

function Preview({ summary }: { summary: SummaryData }) {
  return (
    <section
      aria-labelledby="preview-heading"
      className="flex flex-col gap-3 rounded-2xl bg-white p-5 shadow-[0_1px_2px_rgba(24,33,47,0.08)]"
    >
      <h2 id="preview-heading" className="font-heading text-xl font-semibold">
        Compartes {summary.shared.length} · {summary.keptCount} {summary.keptCount === 1 ? "se queda" : "se quedan"}{" "}
        contigo
      </h2>
      {summary.shared.length === 0 ? (
        <p className="text-sm text-[#18212F]/60">
          Todavía no compartes nada. Lo que elijas abajo aparece aquí tal como lo verá la sala.
        </p>
      ) : (
        <ul className="flex flex-wrap gap-1.5" aria-label="Tópicos que verá la sala">
          {summary.shared.map((t) => {
            const role = rolesOf(t)[0] ?? "comparte";
            return (
              <li
                key={t.id}
                className="flex items-center gap-1.5 rounded-full border border-[#18212F]/12 px-2.5 py-1 text-sm"
              >
                <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: ROLE[role].color }} />
                {t.name}
                <span className="text-xs text-[#18212F]/50">{KIND_LABEL[t.kind]}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Pile({
  title,
  hint,
  action,
  empty,
  children,
}: {
  title: string;
  hint: string;
  action?: ReactNode;
  empty: string;
  children: ReactNode[];
}) {
  return (
    <section className="flex flex-col gap-3" aria-label={title}>
      <div className="flex items-end justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="font-heading text-lg font-semibold">{title}</h2>
          <p className="text-[0.8125rem] text-[#18212F]/60">{hint}</p>
        </div>
        {action}
      </div>
      {children.length === 0 ? (
        <p className="text-sm text-[#18212F]/55">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-2">{children}</ul>
      )}
    </section>
  );
}

function ShareAll({ summary, locked, onShare }: { summary: SummaryData; locked: boolean; onShare: () => void }) {
  const pending = summary.recommended.filter((t) => t.privacy?.decidedBy === "default").length;
  if (pending === 0) return null;
  return (
    <button
      type="button"
      onClick={onShare}
      disabled={locked}
      className={`shrink-0 rounded-lg bg-[#1F8A5B] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40 ${FOCUS}`}
    >
      Compartir {pending === 1 ? "este" : `estos ${pending}`}
    </button>
  );
}

function TopicRow({
  topic,
  reason,
  actionsBelow = false,
  withheld,
  editing,
  busy,
  locked,
  onEdit,
  onCancel,
  onSave,
  children,
}: {
  topic: Topic;
  reason?: string;
  actionsBelow?: boolean;
  withheld?: keyof typeof WITHHELD_COPY;
  editing: boolean;
  busy: boolean;
  locked: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (change: { name: string; kind: Kind }) => void;
  children: ReactNode;
}) {
  return (
    <li className="flex flex-col gap-3 rounded-xl bg-white p-4 shadow-[0_1px_2px_rgba(24,33,47,0.08)]">
      {editing ? (
        <TopicEditor topic={topic} busy={busy} onCancel={onCancel} onSave={onSave} />
      ) : (
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="font-medium break-words">{topic.name}</span>
            <span className="text-xs text-[#18212F]/55">
              {KIND_LABEL[topic.kind]} · {topic.sources.map((s) => SOURCE_LABEL[s]).join(", ")}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <button
              type="button"
              onClick={onEdit}
              disabled={locked}
              className={`text-sm text-[#18212F]/60 underline-offset-4 hover:underline disabled:opacity-40 ${FOCUS}`}
            >
              Editar
            </button>
            {!actionsBelow && children}
          </div>
        </div>
      )}
      {!editing && reason && <p className="text-[0.8125rem] leading-snug text-[#18212F]/70">{reason}</p>}
      {!editing && actionsBelow && children}
      {!editing && withheld && <p className="text-[0.8125rem] text-[#8A1C1C]">{WITHHELD_COPY[withheld]}</p>}
    </li>
  );
}

function TopicEditor({
  topic,
  busy,
  onCancel,
  onSave,
}: {
  topic: Topic;
  busy: boolean;
  onCancel: () => void;
  onSave: (change: { name: string; kind: Kind }) => void;
}) {
  const [name, setName] = useState(topic.name);
  const [kind, setKind] = useState<Kind>(topic.kind);
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ name, kind });
      }}
    >
      <div className="flex gap-2">
        <select
          aria-label="Tipo"
          value={kind}
          onChange={(e) => setKind(e.target.value as Kind)}
          className={`rounded-lg border border-[#18212F]/15 bg-white px-2 py-1.5 text-sm ${FOCUS}`}
        >
          {KindSchema.options.map((k) => (
            <option key={k} value={k}>
              {KIND_LABEL[k]}
            </option>
          ))}
        </select>
        <input
          aria-label="Nombre del tópico"
          value={name}
          maxLength={MAX_NAME_LENGTH}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          className={`min-w-0 flex-1 rounded-lg border border-[#18212F]/15 px-3 py-1.5 text-sm ${FOCUS}`}
        />
      </div>
      <p className="text-xs text-[#18212F]/55">
        Al guardar lo revisamos de nuevo y queda privado hasta que lo vuelvas a compartir.
      </p>
      <div className="flex justify-end gap-3">
        <button type="button" onClick={onCancel} disabled={busy} className={`text-sm text-[#18212F]/60 ${FOCUS}`}>
          Cancelar
        </button>
        <button
          type="submit"
          disabled={busy}
          className={`rounded-lg bg-[#18212F] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40 ${FOCUS}`}
        >
          {busy ? "Revisando…" : "Guardar"}
        </button>
      </div>
    </form>
  );
}

function Switch({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-40 ${checked ? "bg-[#1F8A5B]" : "bg-[#18212F]/20"} ${FOCUS}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : ""}`}
      />
    </button>
  );
}

function Decision({
  topic,
  locked,
  onShare,
  onKeep,
  onShareGeneral,
}: {
  topic: Topic;
  locked: boolean;
  onShare: () => void;
  onKeep: () => void;
  onShareGeneral: () => void;
}) {
  const decided = topic.privacy?.decidedBy === "user";
  const saferName = topic.privacy?.saferName;
  const option = (pressed: boolean) =>
    `rounded-lg border px-3 py-1.5 text-sm disabled:opacity-40 ${pressed ? "border-[#18212F] bg-[#18212F] text-white" : "border-[#18212F]/15 bg-white"} ${FOCUS}`;
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={`Qué hacer con ${topic.name}`}>
      <button
        type="button"
        aria-pressed={decided && topic.public}
        disabled={locked}
        onClick={onShare}
        className={option(decided && topic.public)}
      >
        Compartir
      </button>
      {saferName && (
        <button type="button" disabled={locked} onClick={onShareGeneral} className={option(false)}>
          Compartir «{saferName}»
        </button>
      )}
      <button
        type="button"
        aria-pressed={decided && !topic.public}
        disabled={locked}
        onClick={onKeep}
        className={option(decided && !topic.public)}
      >
        Dejar privado
      </button>
    </div>
  );
}
