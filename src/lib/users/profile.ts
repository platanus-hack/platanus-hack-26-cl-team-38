import { createHash } from "node:crypto";
import { z } from "zod";
import { stripAccents } from "@/lib/embeddings";
import { MatchSchema, type Match, type PublicProjection, type SharedTopic } from "@/lib/types";

// A user is what a person publishes: the projection that passed the privacy filter at check-in.
// The private profile never reaches this code. All the work is in SQL
// (supabase/migrations/20261121230000_users_and_connections.sql); this validates and translates.

// The slice of the Supabase client used here, so the tests can run the real SQL in-process.
export type Db = {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;
};

export async function call(db: Db, fn: string, args: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw Object.assign(new Error(`${fn}: ${error.message}`), { code: error.code });
  return data;
}

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

// The phone makes this up once and keeps it next to its personId. Long enough not to be guessed.
const KeySchema = z.string().min(32).max(200);

export function bearerKey(authorization: string | null): string | undefined {
  return KeySchema.safeParse(authorization?.replace(/^Bearer /i, "")).data;
}

// Who is calling: the personId they claim, proven by the device key. The first key seen for a
// person becomes theirs; after that any other key is refused.
// shortcut: trust on first use and no recovery, a wiped phone is a new person. Real accounts when login is in scope.
export async function authenticate(db: Db, personId: unknown, authorization: string | null): Promise<string | null> {
  const key = bearerKey(authorization);
  if (typeof personId !== "string" || !personId || !key) return null;
  return (await call(db, "claim_key", { p_id: personId, p_key_hash: sha256(key) })) === true ? personId : null;
}

// Writes the public profile: each new topic name's vector once, and which names it matches.
// False when the topics are the ones already stored, and then nothing was rewritten.
export async function saveProfile(db: Db, projection: PublicProjection, key?: string): Promise<boolean> {
  const topics = projection.topics.filter((t) => t.embedding).map((t) => ({ ...t, nameKey: stripAccents(t.name).trim() }));
  const hash = sha256(JSON.stringify(topics.map((t) => [t.id, t.name, t.kind, t.depth, t.sources]).sort()));
  const changed = await call(db, "save_profile", {
    p_id: projection.personId,
    p_display_name: projection.displayName,
    p_topics: topics,
    p_hash: hash,
    p_key_hash: key ? sha256(key) : null,
  });
  return changed === true;
}

type StoredShared = { cosine: number; topics: Record<string, unknown> };

// The stored record names both sides by id; whoever reads gets it as "mine" and "theirs".
export function toShared(stored: unknown, me: string, other: string): SharedTopic[] {
  return (stored as StoredShared[]).map((s) => ({ mine: s.topics[me], theirs: s.topics[other], cosine: s.cosine })) as SharedTopic[];
}

type MatchRow = { other_id: string; other_name: string; shared: unknown };

// The crossing: what `me` shares with each of `others`. Computed on every call (an index join, no
// vectors) and not stored: against 200 people it takes 1 to 3 ms, less than writing the result.
// Whoever shares nothing is left out.
export async function matchUsers(db: Db, me: string, others: string[]): Promise<Match[]> {
  return ((await call(db, "shared_topics", { p_me: me, p_others: others })) as MatchRow[]).map((row) =>
    MatchSchema.parse({ personId: row.other_id, displayName: row.other_name, shared: toShared(row.shared, me, row.other_id) }),
  );
}
