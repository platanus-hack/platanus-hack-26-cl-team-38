import { z } from "zod";
import { hasIdentifier } from "@/lib/privacy/screen";
import { ConnectionSchema, type Connection } from "@/lib/types";
import { call, toShared, type Db } from "./profile";

// A connection is the link that stays between two people once both accepted it, not the lines
// the screens draw by similarity or distance. One row per pair; see the migration for the rules.

const PersonId = z.string().min(1).max(80);

// Strict, like the check-in: a field nobody expects is an error.
export const ConnectionRequestSchema = z
  .object({
    personId: PersonId,
    otherId: PersonId,
    action: z.enum(["propose", "accept", "close"]),
    // Where it was born, for a proposal: the room both are in, or the place name the phone shows.
    origin: z.union([z.object({ roomId: z.string().min(1).max(80) }).strict(), z.object({ place: z.string().min(1).max(80) }).strict()]).optional(),
  })
  .strict();

export type ConnectionRequest = z.infer<typeof ConnectionRequestSchema>;

type Row = {
  other_id: string;
  other_name: string;
  status: string;
  proposed_by_me: boolean;
  my_accepted_at: string | null;
  their_accepted_at: string | null;
  origin_kind: string;
  origin_room_id: string | null;
  origin_label: string;
  shared: unknown;
  created_at: string;
};

const toConnection = (me: string) => (row: Row): Connection =>
  ConnectionSchema.parse({
    personId: row.other_id,
    displayName: row.other_name,
    status: row.status,
    proposedByMe: row.proposed_by_me,
    acceptedAt: { mine: row.my_accepted_at, theirs: row.their_accepted_at },
    origin: { kind: row.origin_kind, roomId: row.origin_room_id, label: row.origin_label },
    shared: toShared(row.shared, me, row.other_id),
    createdAt: row.created_at,
  });

// Only ever the caller's own: there is no way to ask for someone else's connections.
export async function listConnections(db: Db, me: string): Promise<Connection[]> {
  return ((await call(db, "connections_of", { p_me: me })) as Row[]).map(toConnection(me));
}

type Outcome = { status: 200; connection: Connection | null } | { status: 400 | 404 | 409; error: string };

const FOREIGN_KEY = "23503";
const NOT_NULL = "23502";

// `request.personId` must already be authenticated: this trusts it.
export async function runConnectionAction(db: Db, { personId: me, otherId: other, action, origin }: ConnectionRequest): Promise<Outcome> {
  if (me === other) return { status: 400, error: "No puedes conectarte contigo" };
  const one = (rows: unknown) => (rows as Row[]).map(toConnection(me))[0] ?? null;

  if (action === "close") {
    const closed = await call(db, "close_connection", { p_me: me, p_other: other });
    return closed === true ? { status: 200, connection: null } : { status: 404, error: "No hay una conexión con esa persona" };
  }

  if (action === "accept") {
    const connection = one(await call(db, "accept_connection", { p_me: me, p_other: other }));
    return connection ? { status: 200, connection } : { status: 409, error: "No hay una propuesta de esa persona por aceptar" };
  }

  if (!origin) return { status: 400, error: "Una propuesta necesita origin: { roomId } o { place }" };
  const place = "place" in origin ? origin.place : null;
  // The other person will read it: same rule as displayName.
  if (place && hasIdentifier(place)) return { status: 400, error: "place no puede llevar un dato de contacto" };
  try {
    const rows = await call(db, "propose_connection", { p_me: me, p_other: other, p_room_id: "roomId" in origin ? origin.roomId : null, p_place: place });
    return { status: 200, connection: one(rows) };
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === FOREIGN_KEY) return { status: 404, error: "Esa persona todavía no tiene perfil" };
    if (code === NOT_NULL) return { status: 404, error: "No existe esa sala" };
    throw error;
  }
}
