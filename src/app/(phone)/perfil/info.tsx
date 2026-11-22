"use client";

import { useEffect, useState } from "react";
import { z } from "zod";
import { type Gender, GenderSchema, type UserInfo, UserInfoSchema } from "@/lib/types";
import { Sheet } from "../_components/chrome";
import { ListRow } from "../_components/ui";
import { api } from "../_lib/api";
import { COPY } from "../_lib/copy";
import { DEMO } from "../_lib/people";
import { getPhone, type PhoneState, setPhone } from "../_lib/store";
import { toast } from "../_lib/toast";

// Perfil → Información: data you add yourself if you want (mail, age, gender, phone, occupation).
// Only you see it: the backend keeps it in its own table, never in your projection, a cruce or a
// conversation. In demo mode it stays on the phone.

const C = COPY.info;
const GENDERS = GenderSchema.options;

type Draft = { email: string; age: string; gender: Gender | ""; phone: string; occupation: string };
const toDraft = (i: UserInfo | null | undefined): Draft => ({
  email: i?.email ?? "",
  age: i ? String(i.age) : "",
  gender: i?.gender ?? "",
  phone: i?.phone ?? "",
  occupation: i?.occupation ?? "",
});

/** The section in Perfil: what you added, or an invitation, and the button that opens the form. */
export function InfoSection({ s }: { s: PhoneState }) {
  const [open, setOpen] = useState(false);
  const info = s.info ?? null;

  // With a backend, what you saved on another visit comes back from the server.
  useEffect(() => {
    if (DEMO || getPhone().info) return;
    let off = false;
    api(`/api/users/info?personId=${encodeURIComponent(s.personId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json: unknown) => {
        const parsed = z.object({ info: UserInfoSchema.nullable() }).safeParse(json);
        if (!off && parsed.success && parsed.data.info) setPhone({ info: parsed.data.info });
      })
      .catch(() => {});
    return () => {
      off = true;
    };
  }, [s.personId]);

  return (
    <>
      <div className="sec u">{C.title}</div>
      <p className="mute" style={{ margin: 0, fontSize: 13 }}>
        {C.help}
      </p>
      {info && (
        <div className="rows">
          <ListRow title={C.email} data={info.email} />
          <ListRow title={C.age} data={info.age} />
          <ListRow title={C.gender} data={info.gender} />
          <ListRow title={C.phone} data={info.phone} />
          {info.occupation && <ListRow title={C.occupation} data={info.occupation} />}
        </div>
      )}
      <button type="button" className="btn ghost" style={{ marginTop: 16 }} onClick={() => setOpen(true)}>
        {info ? C.edit : C.add}
      </button>
      <Sheet open={open} size="detail" onClose={() => setOpen(false)} label={C.title}>
        <InfoForm key={String(open)} s={s} onDone={() => setOpen(false)} />
      </Sheet>
    </>
  );
}

function InfoForm({ s, onDone }: { s: PhoneState; onDone: () => void }) {
  const [d, setD] = useState<Draft>(() => toDraft(s.info));
  const [errors, setErrors] = useState<Partial<Record<keyof Draft, string>>>({});
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string>();
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));

  async function save() {
    const parsed = UserInfoSchema.safeParse({
      email: d.email.trim(),
      age: d.age.trim() ? Number(d.age) : undefined,
      gender: d.gender || undefined,
      phone: d.phone.trim(),
      occupation: d.occupation.trim(),
    });
    if (!parsed.success) {
      const next: Partial<Record<keyof Draft, string>> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as keyof Draft;
        next[field] ??= C.errors[field];
      }
      setErrors(next);
      return;
    }
    setErrors({});
    setFailed(undefined);
    if (!DEMO) {
      setBusy(true);
      const r = await api("/api/users/info", {
        method: "POST",
        body: JSON.stringify({ personId: s.personId, displayName: s.displayName, info: parsed.data }),
      }).catch(() => null);
      setBusy(false);
      if (!r?.ok) return setFailed(C.failed);
    }
    setPhone({ info: parsed.data });
    toast(C.saved);
    onDone();
  }

  return (
    <form
      className="info-form"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <h2 className="t-title">{C.title}</h2>
      <p className="mute" style={{ margin: "0 0 8px", fontSize: 13 }}>
        {C.private}
      </p>

      <label className="in">
        <span>{C.email}</span>
        <input type="email" inputMode="email" autoComplete="email" value={d.email} onChange={(e) => set({ email: e.target.value })} aria-invalid={!!errors.email} />
        {errors.email && <em>{errors.email}</em>}
      </label>
      <div className="in-row">
        <label className="in">
          <span>{C.age}</span>
          <input type="number" inputMode="numeric" min={13} max={120} value={d.age} onChange={(e) => set({ age: e.target.value })} aria-invalid={!!errors.age} />
          {errors.age && <em>{errors.age}</em>}
        </label>
        <label className="in">
          <span>{C.phone}</span>
          <input type="tel" inputMode="tel" autoComplete="tel" placeholder="+56 9 1234 5678" value={d.phone} onChange={(e) => set({ phone: e.target.value })} aria-invalid={!!errors.phone} />
          {errors.phone && <em>{errors.phone}</em>}
        </label>
      </div>
      <fieldset className="in">
        <legend>{C.gender}</legend>
        <div className="chips-pick" role="radiogroup" aria-label={C.gender}>
          {GENDERS.map((g) => (
            <button key={g} type="button" role="radio" aria-checked={d.gender === g} onClick={() => set({ gender: g })}>
              {g}
            </button>
          ))}
        </div>
        {errors.gender && <em>{errors.gender}</em>}
      </fieldset>
      <label className="in">
        <span>
          {C.occupation} <i>· {C.optional}</i>
        </span>
        <input value={d.occupation} maxLength={60} autoComplete="organization-title" onChange={(e) => set({ occupation: e.target.value })} />
      </label>

      {failed && <div className="err">{failed}</div>}
      <button type="submit" className="btn" disabled={busy} style={{ marginTop: 16 }}>
        {busy ? C.saving : C.save}
      </button>
    </form>
  );
}
