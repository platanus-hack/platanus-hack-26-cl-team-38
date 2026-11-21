import { readdirSync, readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import type { Db } from "./profile";

// Every migration in supabase/migrations, in order, on a Postgres that runs inside the test
// process: no Docker. What a Supabase project brings and the migrations take for granted is
// created first, including the default grants that make RLS the only barrier for the phone.
const SUPABASE = `
  create schema extensions;
  create role anon;
  create role authenticated;
  create role service_role bypassrls;
  create publication supabase_realtime;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
`;

const MIGRATIONS = new URL("../../../supabase/migrations/", import.meta.url);

export async function createTestDb(): Promise<{ pg: PGlite; db: Db }> {
  const pg = await PGlite.create({ extensions: { vector } });
  await pg.exec(SUPABASE);
  for (const file of readdirSync(MIGRATIONS).sort()) await pg.exec(readFileSync(new URL(file, MIGRATIONS), "utf8"));

  // What supabase.rpc() does through PostgREST: named arguments, JSON back, errors as values.
  const db: Db = {
    async rpc(fn, args) {
      const names = Object.keys(args);
      const values = Object.values(args).map((v) => (v !== null && typeof v === "object" && !isTextArray(v) ? JSON.stringify(v) : v));
      try {
        const { rows } = await pg.query<Record<string, unknown>>(`select * from ${fn}(${names.map((n, i) => `${n} => $${i + 1}`).join(", ")})`, values);
        const scalar = rows.length === 1 && Object.keys(rows[0]).join() === fn;
        return { data: JSON.parse(JSON.stringify(scalar ? rows[0][fn] : rows)), error: null };
      } catch (error) {
        const { message, code } = error as { message: string; code?: string };
        return { data: null, error: { message, code } };
      }
    },
  };
  return { pg, db };
}

const isTextArray = (v: object) => Array.isArray(v) && v.every((x) => typeof x === "string");
