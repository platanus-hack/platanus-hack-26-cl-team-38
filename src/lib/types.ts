import { z } from "zod";

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

export const TopicSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: KindSchema,
  depth: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  sources: z.array(SourceSchema).min(1),
  public: z.boolean(),
  embedding: z.array(z.number()).optional(),
});

export const PublicTopicSchema = TopicSchema.omit({ public: true });

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
});

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

export type Kind = z.infer<typeof KindSchema>;
export type Source = z.infer<typeof SourceSchema>;
export type Role = z.infer<typeof RoleSchema>;
export type Signal = z.infer<typeof SignalSchema>;
export type Topic = z.infer<typeof TopicSchema>;
export type PublicTopic = z.infer<typeof PublicTopicSchema>;
export type PersonalNode = z.infer<typeof PersonalNodeSchema>;
export type PublicProjection = z.infer<typeof PublicProjectionSchema>;
export type Theme = z.infer<typeof ThemeSchema>;
export type Mesa = z.infer<typeof MesaSchema>;
export type GroupNode = z.infer<typeof GroupNodeSchema>;

export function toPublicProjection(node: PersonalNode): PublicProjection {
  return {
    personId: node.personId,
    displayName: node.displayName,
    // zod strips unknown keys, which drops `public` from each topic.
    topics: node.topics.filter((t) => t.public).map((t) => PublicTopicSchema.parse(t)),
  };
}
