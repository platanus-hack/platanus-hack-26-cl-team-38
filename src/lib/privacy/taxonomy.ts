import type { Kind } from "@/lib/types";

export const PRIVACY_LEVELS = ["segura", "personal", "sensible"] as const;
export type PrivacyLevel = (typeof PRIVACY_LEVELS)[number];

export const SENSITIVE_CATEGORIES = [
  "salud",
  "sexualidad_genero",
  "politica",
  "religion",
  "origen",
  "situacion_economica",
  "legal",
  "menores",
] as const;
export type SensitiveCategory = (typeof SENSITIVE_CATEGORIES)[number];

export const PERSONAL_CATEGORIES = [
  "identificable",
  "ubicacion_rutina",
  "terceros",
  "laboral_delicado",
  "confidencial",
  "vida_intima",
  "unico",
] as const;
type PersonalCategory = (typeof PERSONAL_CATEGORIES)[number];

export const PRIVACY_CATEGORIES = [...SENSITIVE_CATEGORIES, ...PERSONAL_CATEGORIES] as const;
export type PrivacyCategory = (typeof PRIVACY_CATEGORIES)[number];

export type TopicInput = { kind: Kind; name: string };

export const CATEGORY_LABELS: Record<PrivacyCategory, string> = {
  salud: "salud",
  sexualidad_genero: "sexualidad o género",
  politica: "política",
  religion: "religión",
  origen: "origen o situación migratoria",
  situacion_economica: "situación económica",
  legal: "asuntos legales",
  menores: "menores de edad",
  identificable: "datos que te identifican",
  ubicacion_rutina: "ubicación o rutina",
  terceros: "otras personas",
  laboral_delicado: "tu situación laboral",
  confidencial: "información confidencial",
  vida_intima: "vida íntima",
  unico: "algo que solo calza contigo",
};

const PERSONAL_REASONS: Record<PersonalCategory, string> = {
  identificable: "Dice dónde trabajas, tu cargo o cómo ubicarte.",
  ubicacion_rutina: "Dice dónde o cuándo encontrarte.",
  terceros: "Nombra a otra persona.",
  laboral_delicado: "Habla de tu situación laboral, y tu jefe podría estar en la sala.",
  confidencial: "Puede ser información interna o en reserva.",
  vida_intima: "Es parte de tu vida íntima.",
  unico: "Es tan específico que te señala solo a ti.",
};

// Fixed copy instead of model-written text: it is faster (no output tokens) and says the same thing every time.
export function reasonFor(category: PrivacyCategory | undefined): string {
  if (!category) return "Podría decir de más sobre ti.";
  return category in PERSONAL_REASONS ? PERSONAL_REASONS[category as PersonalCategory] : `Toca un tema de ${CATEGORY_LABELS[category]}.`;
}

export type Finding = {
  level: Exclude<PrivacyLevel, "segura">;
  category: PrivacyCategory;
  by: "patron" | "lexico" | "ancla" | "juez";
};

// Bump when the lexicon, the anchors or the judge prompt change: every stored verdict goes stale
// and its topic falls back to private until it is classified again.
const CLASSIFIER_VERSION = 1;

export function strictest(...levels: PrivacyLevel[]): PrivacyLevel {
  return PRIVACY_LEVELS[Math.max(0, ...levels.map((l) => PRIVACY_LEVELS.indexOf(l)))];
}

export function fold(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

// A verdict only covers the exact (kind, name) it was computed for: renaming a topic or changing
// its kind must send it back through the filter.
export function fingerprint(topic: TopicInput): string {
  return `v${CLASSIFIER_VERSION}:${topic.kind}:${fold(topic.name)}`;
}
