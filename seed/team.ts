import { readdirSync, readFileSync } from "node:fs";
import { z } from "zod";
import { KindSchema, SourceSchema } from "@/lib/types";

// Real teammates live in seed/team/<slug>.json (written by `pnpm seed:person`) so adding someone never
// touches people.ts. Default room is the hack room; the synthetic MUT room must stay at 15–20 people.

export const TeamPersonSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  displayName: z.string().min(1),
  rooms: z.array(z.enum(["seed-hack", "seed-mut"])).default(["seed-hack"]),
  topics: z.array(z.tuple([z.string().min(1), KindSchema, z.union([z.literal(1), z.literal(2), z.literal(3)]), z.array(SourceSchema).min(1)])).min(1),
});

export type TeamPerson = z.infer<typeof TeamPersonSchema>;

export const TEAM_DIR = new URL("./team/", import.meta.url);

export const team: TeamPerson[] = readdirSync(TEAM_DIR)
  .filter((f) => f.endsWith(".json"))
  .sort()
  .map((f) => TeamPersonSchema.parse(JSON.parse(readFileSync(new URL(f, TEAM_DIR), "utf8"))));
