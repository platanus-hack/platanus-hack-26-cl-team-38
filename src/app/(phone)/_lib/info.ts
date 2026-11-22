import { type UserInfo, UserInfoSchema } from "@/lib/types";

// Perfil → Información: one tidy shape per field, so the form shows exactly what the server stores.

export type InfoField = keyof UserInfo;

/** Chilean numbers read as +56 9 1234 5678; anything else keeps its digits (and its +). */
function formatPhone(raw: string): string {
  const plus = raw.trim().startsWith("+");
  let digits = raw.replace(/\D/g, "").slice(0, 15);
  // A mobile typed the local way: nine digits starting with 9.
  if (!plus && digits.length === 9 && digits.startsWith("9")) digits = `56${digits}`;
  if (digits.length === 11 && digits.startsWith("56"))
    return `+56 ${digits[2]} ${digits.slice(3, 7)} ${digits.slice(7)}`;
  return (plus ? "+" : "") + digits;
}

/** How each typed field is tidied, on blur and before saving. */
export const FORMAT: Record<Exclude<InfoField, "gender">, (raw: string) => string> = {
  email: (v) => v.trim().toLowerCase(),
  age: (v) => v.replace(/\D/g, "").slice(0, 3),
  phone: formatPhone,
  occupation: (v) => {
    const text = v.trim().replace(/\s+/g, " ").slice(0, 60);
    return text ? text[0].toLocaleUpperCase("es-CL") + text.slice(1) : text;
  },
};

/** The form's raw text → the contract, or the first field that does not fit it. */
export function parseInfo(
  raw: Record<InfoField, string>,
): { ok: true; info: UserInfo } | { ok: false; field: InfoField } {
  const age = FORMAT.age(raw.age);
  const parsed = UserInfoSchema.safeParse({
    email: FORMAT.email(raw.email),
    // An empty age must fail as a number, not pass as 0.
    age: age ? Number(age) : Number.NaN,
    gender: raw.gender,
    phone: FORMAT.phone(raw.phone),
    occupation: FORMAT.occupation(raw.occupation),
  });
  if (parsed.success) return { ok: true, info: parsed.data };
  return { ok: false, field: (parsed.error.issues[0]?.path[0] as InfoField | undefined) ?? "email" };
}
