"use client";

import { useEffect, useState } from "react";
import { idFor } from "@/lib/node/node";
import type { Kind } from "@/lib/types";
import { Sheet } from "../_components/chrome";
import { scheduleCheckIn } from "../_lib/api";
import { COPY } from "../_lib/copy";
import { KIND_LABEL } from "../_lib/node";
import type { NodeSync } from "../_lib/node-sync";
import { cap } from "../_lib/people";
import { mergeSignals, type PhoneState, setPhone, setPublic } from "../_lib/store";
import { toast } from "../_lib/toast";

// "Agregar un tema": something about you that no Fuente brought. It enters like any signal
// (source "manual") and goes through the same privacy filter: `sensible` never enters the Nodo,
// and it is shared only if you said so.

const C = COPY.addTopic;
const KINDS: Kind[] = ["sabe", "hace", "le_gusta", "busca", "quiere_ser", "es", "ofrece"];
const WANTS: Kind[] = ["busca", "quiere_ser"];
/** The depth you pick becomes the signal's strength (see depthFor in synthesize). */
const STRENGTH = { 1: 0.4, 2: 0.7, 3: 0.9 } as const;

/** The button, the form, and what happens after: wait for the filter, then share if you asked. */
export function AddTopic({ s, sync }: { s: PhoneState; sync: NodeSync }) {
  const [open, setOpen] = useState(false);
  // Kept in the phone's state, so a review that ends after you leave Perfil still finishes.
  const pending = s.pendingTopic ?? null;

  // The filter answered: the topic is in the Nodo (share it if asked), or it was left out.
  const arrived = pending && s.node?.topics.find((t) => t.id === pending.id && t.privacy);
  useEffect(() => {
    if (!pending) return;
    if (arrived) {
      if (pending.share && !arrived.public) {
        setPublic(arrived.id, true);
        scheduleCheckIn();
      }
      toast(pending.share ? C.addedShared(cap(pending.name)) : C.added(cap(pending.name)));
      setPhone({ pendingTopic: null });
    } else if (!sync.reviewing && sync.held > pending.held) {
      toast(C.held(cap(pending.name)));
      setPhone({ pendingTopic: null });
    } else if (sync.error) {
      toast(sync.error);
      setPhone({ pendingTopic: null });
    }
  }, [pending, arrived, sync.reviewing, sync.held, sync.error]);

  return (
    <>
      <button type="button" className="btn ghost" onClick={() => setOpen(true)} disabled={!!pending}>
        {pending ? C.reviewing : `+ ${C.button}`}
      </button>
      <Sheet open={open} size="detail" onClose={() => setOpen(false)} label={C.title}>
        <TopicForm
          key={String(open)}
          onAdd={(name, kind, depth, share) => {
            setPhone({
              pendingTopic: { id: idFor(s.personId, name.trim().toLowerCase()), name, share, held: sync.held },
            });
            mergeSignals([{ source: "manual", kind, label: name, strength: STRENGTH[depth] }]);
            setOpen(false);
          }}
          exists={(name) => !!s.node?.topics.some((t) => t.id === idFor(s.personId, name.trim().toLowerCase()))}
        />
      </Sheet>
    </>
  );
}

function TopicForm({
  onAdd,
  exists,
}: {
  onAdd: (name: string, kind: Kind, depth: 1 | 2 | 3, share: boolean) => void;
  exists: (name: string) => boolean;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<Kind>("sabe");
  const [depth, setDepth] = useState<1 | 2 | 3>(2);
  const [share, setShare] = useState(true);
  const [error, setError] = useState<string>();
  const wants = WANTS.includes(kind);

  return (
    <form
      className="info-form"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const n = name.trim().replace(/\s+/g, " ");
        if (n.length < 2 || n.length > 60) return setError(C.errorLength);
        if (exists(n)) return setError(C.errorExists);
        onAdd(n, kind, wants ? 1 : depth, share);
      }}
    >
      <h2 className="t-title">{C.title}</h2>
      <p className="mute" style={{ margin: "0 0 8px", fontSize: 13 }}>
        {C.help}
      </p>

      <fieldset className="in">
        <legend>{C.kind}</legend>
        <div className="chips-pick" role="radiogroup" aria-label={C.kind}>
          {KINDS.map((k) => (
            <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)}>
              {cap(KIND_LABEL[k])}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="in">
        <span>{C.name}</span>
        <input
          value={name}
          maxLength={60}
          placeholder={C.placeholder[kind]}
          enterKeyHint="done"
          onChange={(e) => {
            setName(e.target.value);
            setError(undefined);
          }}
          aria-invalid={!!error}
        />
        {error && <em>{error}</em>}
      </label>

      {!wants && (
        <fieldset className="in">
          <legend>{C.depth}</legend>
          <div className="segbar" role="radiogroup" aria-label={C.depth}>
            {([1, 2, 3] as const).map((d) => (
              <button key={d} type="button" role="radio" aria-checked={depth === d} onClick={() => setDepth(d)}>
                {C.depths[d]}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      <div className="row">
        <span className="main">
          <span className="title" style={{ display: "block" }}>
            {C.share}
          </span>
          <span className="sub wrap" style={{ display: "block" }}>
            {C.shareHelp}
          </span>
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={share}
          aria-label={C.share}
          className="switch"
          onClick={() => setShare(!share)}
        />
      </div>

      <button type="submit" className="btn" disabled={!name.trim()}>
        {C.submit}
      </button>
    </form>
  );
}
