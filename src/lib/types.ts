import { z } from "zod";
import { PRIVACY_CATEGORIES, PRIVACY_LEVELS } from "./privacy/taxonomy";

export const KindSchema = z.enum(["es", "sabe", "hace", "le_gusta", "quiere_ser", "busca", "ofrece"]);
// "google": Takeout (YouTube and Calendar). "manual": a topic the person wrote themselves in Perfil.
export const SourceSchema = z.enum(["claude", "chatgpt", "gemini", "spotify", "github", "instagram", "google", "manual"]);
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

// Perfil → Información (src/lib/users/info.ts). Personal data, unlike everything above: only its
// owner reads it. It never goes into a projection, a room, a log or anything another person gets.
export const GenderSchema = z.enum(["Mujer", "Hombre", "No binario", "Prefiero no decir"]);

export const UserInfoSchema = z.object({
  email: z.email().max(120),
  age: z.number().int().min(13).max(120),
  gender: GenderSchema,
  phone: z.string().regex(/^\+?[0-9 ]{8,16}$/),
  // Optional: missing or empty both mean "not said".
  occupation: z.string().max(60).default(""),
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

// Plans (src/lib/plans/). A person, a few of their accepted connections, one agent each and an
// orchestrator. Every text below is public to the participants: it went through the lexicon, and
// what an agent brings from its network never names the contact it came from.
export const PlanStatusSchema = z.enum(["deliberando", "consenso", "decidido"]);
// `codigo`: the orchestrator could not be reached, and the server closed with what there was.
export const PlanDecidedBySchema = z.enum(["consenso", "orquestador", "codigo"]);
export const PLAN_MAX_ROUNDS = 5;

const PlanLine = z.string().min(1).max(240);

export const PlanContentSchema = z.object({
  resumen: z.string().min(1).max(600),
  decisiones: z.array(z.object({ tema: z.string().min(1).max(80), valor: PlanLine, porque: z.string().max(240) }).strict()),
  pasos: z.array(z.object({ que: PlanLine, responsable: z.string().min(1) }).strict()),
  // What is still unsolved, as full sentences: they are also what the network is searched with.
  abiertos: z.array(PlanLine),
  // Who did not get what they asked for. Only a decided plan has them.
  desacuerdos: z.array(z.object({ personId: z.string().min(1), tema: z.string().min(1).max(80), detalle: PlanLine }).strict()),
}).strict();

// Something an agent brought to the table, citing the line it comes from. `contactId` is who of
// its network said it: stored so the owner can see it, removed for everyone else.
export const PlanAporteSchema = z.object({
  lineId: z.string().min(1),
  texto: PlanLine,
  origen: z.enum(["propio", "red"]),
  contactId: z.string().min(1).optional(),
}).strict();

export const PlanMessageSchema = z.discriminatedUnion("agent", [
  // The proposal itself lives once, in `plan_versions`.
  z.object({ agent: z.literal("orquestador"), content: z.object({ version: z.number().int().positive(), final: z.boolean() }).strict() }).strict(),
  z.object({
    agent: z.literal("miembro"),
    personId: z.string().min(1),
    content: z.discriminatedUnion("tipo", [
      z.object({
        tipo: z.literal("postura"),
        postura: PlanLine,
        // The condition as the plan needs it, never its cause.
        condiciones: z.array(z.object({ texto: PlanLine, dura: z.boolean() }).strict()),
        aportes: z.array(PlanAporteSchema),
      }).strict(),
      z.object({
        tipo: z.literal("respuesta"),
        decision: z.enum(["accept", "adjust", "block"]),
        motivo: PlanLine,
        ajustes: z.array(z.object({ tema: z.string().min(1).max(80), pide: PlanLine }).strict()),
        aportes: z.array(PlanAporteSchema),
      }).strict(),
    ]),
  }).strict(),
  z.object({
    agent: z.literal("verificador"),
    personId: z.string().min(1).optional(),
    content: z.object({
      descartado: z.enum(["aporte", "texto", "turno", "plan"]),
      razon: z.enum(["cita_inventada", "privacidad", "nombra_contacto", "sin_respuesta", "orquestador_caido"]),
    }).strict(),
  }).strict(),
]);

// What one participant reads of a plan. An aporte from someone's network says whose contact it
// was; the contact's name is there only for that participant.
const PlanAporteViewSchema = z.object({ texto: PlanLine, origen: z.enum(["propio", "red"]), contacto: z.string().optional() }).strict();
const PlanMemberSchema = z.object({ personId: z.string().min(1), displayName: z.string().min(1) }).strict();

export const PlanMessageViewSchema = z.object({
  id: z.number().int(),
  round: z.number().int().nonnegative(),
  agent: z.enum(["orquestador", "miembro", "verificador"]),
  personId: z.string().nullable(),
  // One readable line per message, written by the server from the structured content.
  text: z.string(),
  decision: z.enum(["accept", "adjust", "block"]).optional(),
  aportes: z.array(PlanAporteViewSchema),
  createdAt: z.string(),
}).strict();

export const PlanViewSchema = z.object({
  id: z.string().min(1),
  ownerId: z.string().min(1),
  intent: z.string().min(1),
  status: PlanStatusSchema,
  round: z.number().int().nonnegative(),
  maxRounds: z.number().int().positive(),
  members: z.array(PlanMemberSchema),
  myRestrictions: z.array(z.string()),
  // The plan in force: the decided version, or the latest proposal while they deliberate.
  plan: z.object({ version: z.number().int().positive(), content: PlanContentSchema, decidedBy: PlanDecidedBySchema.nullable() }).strict().nullable(),
  messages: z.array(PlanMessageViewSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
}).strict();

export const PlanSummarySchema = z.object({
  id: z.string().min(1),
  ownerId: z.string().min(1),
  intent: z.string().min(1),
  status: PlanStatusSchema,
  round: z.number().int().nonnegative(),
  maxRounds: z.number().int().positive(),
  members: z.array(PlanMemberSchema),
  resumen: z.string().nullable(),
  updatedAt: z.string(),
}).strict();

// Who a plan can be made with (level 2) and whose knowledge their agents can bring (level 3).
export const PlanGraphSchema = z.object({
  connections: z.array(PlanMemberSchema.extend({ contacts: z.number().int().nonnegative() }).strict()),
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
export type Gender = z.infer<typeof GenderSchema>;
export type UserInfo = z.infer<typeof UserInfoSchema>;
export type MesaDecision = z.infer<typeof MesaDecisionSchema>;
export type LogEntry = z.input<typeof LogEntrySchema>;
export type Log = z.infer<typeof LogSchema>;
export type PlanStatus = z.infer<typeof PlanStatusSchema>;
export type PlanDecidedBy = z.infer<typeof PlanDecidedBySchema>;
export type PlanContent = z.infer<typeof PlanContentSchema>;
export type PlanAporte = z.infer<typeof PlanAporteSchema>;
export type PlanMessage = z.infer<typeof PlanMessageSchema>;
export type PlanMessageView = z.infer<typeof PlanMessageViewSchema>;
export type PlanView = z.infer<typeof PlanViewSchema>;
export type PlanSummary = z.infer<typeof PlanSummarySchema>;
export type PlanGraph = z.infer<typeof PlanGraphSchema>;
