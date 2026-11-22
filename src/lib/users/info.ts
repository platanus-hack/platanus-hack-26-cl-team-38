import { z } from "zod";
import { hasIdentifier } from "@/lib/privacy/screen";
import { UserInfoSchema, type UserInfo } from "@/lib/types";
import { authenticate, bearerKey, call, ensureUser, type Db } from "./profile";

// Perfil → Información: mail, age, gender, phone and occupation. Personal data. It is read only
// through here, by its owner with their device key, and written nowhere else: not the projection,
// not room_members, not a log. SQL in supabase/migrations/20261122080000_user_info.sql.

type Row = { email: string; age: number; gender: string; phone: string; occupation: string };

const toInfo = (row: Row | undefined): UserInfo | null =>
  row ? UserInfoSchema.parse({ email: row.email, age: row.age, gender: row.gender, phone: row.phone, occupation: row.occupation }) : null;

// No key check: for the seed and for code that already authenticated the person.
export async function saveUserInfo(db: Db, personId: string, info: UserInfo): Promise<UserInfo> {
  const rows = await call(db, "save_user_info", {
    p_id: personId,
    p_email: info.email,
    p_age: info.age,
    p_gender: info.gender,
    p_phone: info.phone,
    p_occupation: info.occupation,
  });
  return toInfo((rows as Row[])[0])!;
}

export async function getUserInfo(db: Db, personId: string): Promise<UserInfo | null> {
  return toInfo(((await call(db, "user_info_of", { p_id: personId })) as Row[])[0]);
}

// Strict, like the check-in. `displayName` is only used when the person does not exist yet.
export const SaveUserInfoSchema = z
  .object({
    personId: z.string().min(1).max(80),
    displayName: z.string().min(1).max(40).optional(),
    info: UserInfoSchema,
  })
  .strict();

type Reply = { status: 200; info: UserInfo | null } | { status: 400 | 401; error: string };

const DENIED: Reply = { status: 401, error: "Falta la clave del dispositivo, o no es la de esa persona" };

export async function readOwnInfo(db: Db, personId: unknown, authorization: string | null): Promise<Reply> {
  const me = await authenticate(db, personId, authorization, { ownerOnly: true });
  return me ? { status: 200, info: await getUserInfo(db, me) } : DENIED;
}

export async function saveOwnInfo(db: Db, body: unknown, authorization: string | null): Promise<Reply> {
  const parsed = SaveUserInfoSchema.safeParse(body);
  if (!parsed.success) return { status: 400, error: z.prettifyError(parsed.error) };
  const { personId, displayName, info } = parsed.data;
  const key = bearerKey(authorization);
  if (displayName && key) {
    if (hasIdentifier(displayName)) return { status: 400, error: "displayName no puede llevar un dato de contacto" };
    await ensureUser(db, personId, displayName, key);
  }
  const me = await authenticate(db, personId, authorization, { ownerOnly: true });
  return me ? { status: 200, info: await saveUserInfo(db, me, info) } : DENIED;
}
