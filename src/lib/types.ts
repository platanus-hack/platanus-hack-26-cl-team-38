import { z } from "zod";
import { PRIVACY_CATEGORIES, PRIVACY_LEVELS } from "./privacy/taxonomy";

export const KindSchema = z.enum(["es", "sabe", "hace", "le_gusta", "quiere_ser", "busca", "ofrece"]);
export const SourceSchema = z.enum(["claude", "chatgpt", "gemini", "spotify", "github", "instagram"]);
export const RoleSchema = z.enum(["aporta", "busca", "comparte"]);

export const SignalSchema = z.object({
  source: SourceSchema,
  kind: KindSchema,
  label: z.string().min(1),
  strength: z.number().min(0).max(1),
  // Owner-only: never leaves the phone.
  evidence: z.string(),
});

// What a synthesizer may receive. `evidence` is quoted from private conversations, so it has no
// place in a request that leaves the phone; strict, so sending it is an error.
export const SynthesisSignalSchema = SignalSchema.omit({ evidence: true }).strict();

export const PrivacyLevelSchema = z.enum(PRIVACY_LEVELS);

// Owner-only, like `evidence`: the verdict of the privacy filter for one topic.
export const TopicPrivacySchema = z.object({
  level: PrivacyLevelSchema,
  category: z.enum(PRIVACY_CATEGORIES).optional(),
  reason: z.string().optional(),
  saferName: z.string().optional(),
  // fingerprint() of the kind and name this verdict was computed for.
  checkedFor: z.string(),
  decidedBy: z.enum(["default", "user"]),
});

export const TopicSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: KindSchema,
  depth: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  sources: z.array(SourceSchema).min(1),
  public: z.boolean(),
  embedding: z.array(z.number()).optional(),
  // Missing means "never went through the filter": such a topic cannot be published.
  privacy: TopicPrivacySchema.optional(),
});

// Allow-list on purpose: a field added to Topic is not published until someone adds it here.
export const PublicTopicSchema = TopicSchema.pick({ id: true, name: true, kind: true, depth: true, sources: true, embedding: true }).strict();

export const PersonalNodeSchema = z.object({
  personId: z.string().min(1),
  displayName: z.string().min(1),
  version: z.number().int().nonnegative(),
  topics: z.array(TopicSchema),
});

export const PublicProjectionSchema = z.object({
  personId: z.string().min(1),
  displayName: z.string().min(1),
  topics: z.array(PublicTopicSchema),
}).strict();

// Not in the architecture note: added so the room screen (front E) can draw themes before
// the room engine (front C) exists. Theme ids are what Mesa.anchorThemeId points to.
export const ThemeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  topicIds: z.array(z.string()).min(1),
});

export const MesaSchema = z.object({
  id: z.string().min(1),
  roomId: z.string().min(1),
  anchorThemeId: z.string().min(1),
  members: z.array(
    z.object({ personId: z.string(), role: RoleSchema, themeId: z.string(), topicId: z.string() }),
  ),
  score: z.number(),
});

export const GroupNodeStatusSchema = z.enum(["propuesta", "activa", "disuelta"]);

export const GroupNodeSchema = z.object({
  id: z.string().min(1),
  roomId: z.string().min(1),
  theme: z.string(),
  members: z.array(
    z.object({ personId: z.string(), role: RoleSchema, topicId: z.string(), cita: z.string() }),
  ),
  comparten: z.array(z.string()),
  plan: z.string(),
  puntoDeEncuentro: z.string(),
  aceptado: z.record(z.string(), z.boolean().nullable()),
  status: GroupNodeStatusSchema,
});

// Proximity (src/lib/proximity/). A phone sends its position to the server; what comes back to
// anyone is distance, bearing and uncertainty, never coordinates. Strict on purpose, in and out.
export const ProximityJoinSchema = z.object({
  roomId: z.string().min(1),
  personId: z.string().min(1),
  displayName: z.string().min(1).max(40),
  // Metres. With indoor GPS the effective reach is wider than this: see src/lib/proximity/README.md.
  radius: z.number().min(5).max(500),
}).strict();

export const ProximityReportSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  // What the browser gives in `coords.accuracy`, in metres.
  accuracy: z.number().min(0).max(100_000),
  // Chosen by the phone and echoed as `anchor`, so it knows which of its reports the distances are from.
  stamp: z.number().int().nonnegative(),
}).strict();

export const ProximityNeighborSchema = z.object({
  personId: z.string().min(1),
  displayName: z.string().min(1),
  distance: z.number().int().nonnegative(),
  // Degrees clockwise from north, from the recipient towards the neighbour.
  bearing: z.number().int().min(0).max(359),
  // ± metres of `distance`. Below about twice this, the distance cannot be told apart from zero.
  uncertainty: z.number().int().nonnegative(),
}).strict();

export const ProximityUpdateSchema = z.object({
  anchor: z.number().int().nonnegative(),
  enter: z.array(ProximityNeighborSchema),
  move: z.array(ProximityNeighborSchema),
  leave: z.array(z.string()),
}).strict();

// Users and connections (src/lib/users/). What a person gets back about someone else: always seen
// from their own side, only public topics, never a vector.
const SharedSideSchema = PublicTopicSchema.pick({ name: true, kind: true, depth: true });

// Two topics that match: the same name (cosine 1) or by meaning (cosine >= 0.60).
export const SharedTopicSchema = z.object({ mine: SharedSideSchema, theirs: SharedSideSchema, cosine: z.number() }).strict();

// What you share with someone you crossed. Computed on every request, never stored.
export const MatchSchema = z.object({
  personId: z.string().min(1),
  displayName: z.string().min(1),
  shared: z.array(SharedTopicSchema).min(1),
}).strict();

// There is no "rechazada" or "retirada": rejecting or withdrawing deletes the connection.
export const ConnectionStatusSchema = z.enum(["propuesta", "aceptada"]);

export const ConnectionSchema = z.object({
  personId: z.string().min(1),
  displayName: z.string().min(1),
  status: ConnectionStatusSchema,
  proposedByMe: z.boolean(),
  acceptedAt: z.object({ mine: z.string().nullable(), theirs: z.string().nullable() }),
  // Where it was born. `label` is the room, place or mesa theme name, copied so it outlives them.
  origin: z.object({ kind: z.enum(["sala", "lugar", "mesa"]), roomId: z.string().nullable(), mesaId: z.string().nullable(), label: z.string().min(1) }),
  // What they had in common when the second one accepted. Empty while it is a proposal.
  shared: z.array(SharedTopicSchema),
  createdAt: z.string(),
}).strict();

// Mesas (src/lib/mesas/). The main decisions of a mesa's agents are the rows of
// `deliberation_messages`: what changes the state of the mesa and is shown to people. One shape
// per agent, and the only free text is `motivo`. Anything else an agent did is a log.
export const MesaDecisionSchema = z.discriminatedUnion("agent", [
  // The plan itself lives once, in `group_nodes`. A revision is a new group node.
  z.object({ agent: z.literal("facilitador"), content: z.object({ round: z.union([z.literal(0), z.literal(1)]), groupNodeId: z.string().min(1) }).strict() }).strict(),
  z.object({
    agent: z.literal("miembro"),
    personId: z.string().min(1),
    // `motivo` is a public line: it does not repeat the day's intent nor name a private topic.
    content: z.object({ decision: z.enum(["accept", "reject", "adjust"]), motivo: z.string().min(1).max(140) }).strict(),
  }).strict(),
  z.object({
    agent: z.literal("verificador"),
    content: z.object({
      descartado: z.enum(["rol", "mesa"]),
      personId: z.string().min(1).optional(),
      razon: z.enum(["topico_inexistente", "kind_no_corresponde", "menos_de_tres"]),
    }).strict(),
  }).strict(),
]);

export const LogActorSchema = z.enum(["facilitador", "miembro", "verificador", "motor", "persona"]);
export const LogEventSchema = z.enum(["llamada", "salida_invalida", "bloqueo_privacidad", "mesa_creada", "acepto", "rechazo"]);

// The measurement of one call or action. No prompt and no intent fit here on purpose.
export const LogDetailSchema = z.object({
  model: z.string().max(60),
  ms: z.number().nonnegative(),
  tokensIn: z.number().int().nonnegative(),
  tokensOut: z.number().int().nonnegative(),
  attempt: z.number().int().positive(),
  result: z.string().max(40),
  // An output that did not become a decision. Never from a member agent: it saw private data.
  output: z.unknown(),
}).partial().strict();

export const LogEntrySchema = z.object({
  actor: LogActorSchema,
  event: LogEventSchema,
  userId: z.string().min(1).optional(),
  mesaId: z.string().min(1).optional(),
  detail: LogDetailSchema.default({}),
}).strict()
  .refine((log) => log.userId || log.mesaId, "Un log referencia a un usuario, a una mesa o a ambos")
  .refine((log) => log.detail.output === undefined || !["miembro", "persona"].includes(log.actor), "El output de un agente de miembro no se guarda");

// What a person reads of their own agent's activity.
export const LogSchema = z.object({
  id: z.number().int(),
  mesaId: z.string().nullable(),
  actor: LogActorSchema,
  event: LogEventSchema,
  detail: LogDetailSchema,
  createdAt: z.string(),
}).strict();

export type Kind = z.infer<typeof KindSchema>;
export type Source = z.infer<typeof SourceSchema>;
export type Role = z.infer<typeof RoleSchema>;
export type Signal = z.infer<typeof SignalSchema>;
export type SynthesisSignal = z.infer<typeof SynthesisSignalSchema>;
export type Topic = z.infer<typeof TopicSchema>;
export type PrivacyLevel = z.infer<typeof PrivacyLevelSchema>;
export type TopicPrivacy = z.infer<typeof TopicPrivacySchema>;
export type PublicTopic = z.infer<typeof PublicTopicSchema>;
export type PersonalNode = z.infer<typeof PersonalNodeSchema>;
export type PublicProjection = z.infer<typeof PublicProjectionSchema>;
export type Theme = z.infer<typeof ThemeSchema>;
export type Mesa = z.infer<typeof MesaSchema>;
export type GroupNode = z.infer<typeof GroupNodeSchema>;
export type ProximityJoin = z.infer<typeof ProximityJoinSchema>;
export type ProximityReport = z.infer<typeof ProximityReportSchema>;
export type ProximityNeighbor = z.infer<typeof ProximityNeighborSchema>;
export type ProximityUpdate = z.infer<typeof ProximityUpdateSchema>;
export type SharedTopic = z.infer<typeof SharedTopicSchema>;
export type Match = z.infer<typeof MatchSchema>;
export type ConnectionStatus = z.infer<typeof ConnectionStatusSchema>;
export type Connection = z.infer<typeof ConnectionSchema>;
export type MesaDecision = z.infer<typeof MesaDecisionSchema>;
export type LogEntry = z.input<typeof LogEntrySchema>;
export type Log = z.infer<typeof LogSchema>;
