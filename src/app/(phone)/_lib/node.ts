import { synthesizeSeedTopics } from "../../../../seed/synthesize";
import { type Kind, type PersonalNode, type Role, type Signal, SignalSchema, type Source, type Topic } from "@/lib/types";

// Stand-ins for front B until /api/synthesize and src/lib/privacy/ exist: the seed's deterministic
// synthesizer (exact-label merge + depth caps) and a tiny sensitive lexicon. Swap these two
// functions and the screens keep working.

export function slug(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Resyncing keeps your manual edits: same topic id keeps its depth and public flag. */
export function buildNode(personId: string, displayName: string, signals: Signal[], previous: PersonalNode | null): PersonalNode {
  const before = new Map(previous?.topics.map((t) => [t.id, t]));
  const topics: Topic[] = synthesizeSeedTopics(signals).map(([name, kind, depth, sources]) => {
    const id = `${personId}.${slug(name)}`;
    const old = before.get(id);
    return { id, name, kind, depth: old?.depth ?? depth, sources, public: old?.public ?? false };
  });
  return { personId, displayName, version: (previous?.version ?? 0) + 1, topics };
}

const SENSITIVE =
  /\b(salud|terapia|psiquiatr|depresi|ansiedad|diagn|medicament|embaraz|fertilidad|adicci|discapacidad|orientaci[oó]n sexual|gay|lesbiana|trans\b|citas|tinder|pol[ií]tic|partido|milit|vot|sindicato|religi|iglesia|ayuno|dios|migra|visa|deuda|sueldo|salario|cesant|quiebra|cr[eé]dito|juicio|demanda|denuncia|antecedentes|pensi[oó]n|hij[oa]s?\b|colegio de)/i;

/** "Se queda contigo": never offered for sharing. */
export function isSensitive(topic: Pick<Topic, "name">): boolean {
  return SENSITIVE.test(topic.name.normalize("NFD").replace(/[̀-ͯ]/g, ""));
}

/** Parse what an assistant returns to seed/prompt-perfil.md. Tolerates text or ```json fences around it. */
export function parseAssistantAnswer(raw: string, source: Source): { signals: Signal[]; skipped: number } {
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start < 0 || end <= start) throw new Error("No encontré un arreglo JSON en la respuesta.");
  let items: unknown;
  try {
    items = JSON.parse(raw.slice(start, end + 1));
  } catch {
    throw new Error("El JSON no se pudo leer. Copia la respuesta completa, desde [ hasta ].");
  }
  if (!Array.isArray(items)) throw new Error("La respuesta tiene que ser un arreglo.");
  const signals: Signal[] = [];
  let skipped = 0;
  for (const item of items) {
    // The assistant names itself as source; trust the button the person tapped instead.
    const parsed = SignalSchema.safeParse({ ...(item as object), source });
    if (parsed.success) signals.push(parsed.data);
    else skipped++;
  }
  if (signals.length === 0) throw new Error("Ninguna señal tenía la forma esperada.");
  return { signals, skipped };
}

export const KIND_LABEL: Record<Kind, string> = {
  es: "es",
  sabe: "sabe",
  hace: "hace",
  le_gusta: "le gusta",
  quiere_ser: "quiere ser",
  busca: "busca",
  ofrece: "ofrece",
};

export const ROLE_LABEL: Record<Role, { you: string; them: string; hint: string }> = {
  aporta: { you: "Aportas", them: "Aporta", hint: "sabes o haces el tema" },
  busca: { you: "Buscas", them: "Busca", hint: "quieres aprenderlo o hacerlo" },
  comparte: { you: "Compartes", them: "Comparte", hint: "te gusta, sin más" },
};

export function roleFor(topic: Pick<Topic, "kind" | "depth">): Role {
  if (topic.kind === "busca" || topic.kind === "quiere_ser") return "busca";
  if ((topic.kind === "sabe" || topic.kind === "hace" || topic.kind === "es" || topic.kind === "ofrece") && topic.depth >= 2) return "aporta";
  return "comparte";
}

/** Signals to try the flow without pasting anything. */
export const EXAMPLE_SIGNALS: Signal[] = [
  { source: "claude", kind: "sabe", label: "diseño ux", strength: 0.9, evidence: "ejemplo" },
  { source: "claude", kind: "hace", label: "escalada", strength: 0.8, evidence: "ejemplo" },
  { source: "claude", kind: "sabe", label: "python", strength: 0.7, evidence: "ejemplo" },
  { source: "claude", kind: "quiere_ser", label: "fundar una startup", strength: 0.7, evidence: "ejemplo" },
  { source: "claude", kind: "busca", label: "socio técnico", strength: 0.6, evidence: "ejemplo" },
  { source: "claude", kind: "le_gusta", label: "jazz", strength: 0.6, evidence: "ejemplo" },
  { source: "claude", kind: "le_gusta", label: "fotografía de naturaleza", strength: 0.6, evidence: "ejemplo" },
  { source: "claude", kind: "hace", label: "cocina peruana", strength: 0.5, evidence: "ejemplo" },
  { source: "claude", kind: "busca", label: "terapia para la ansiedad", strength: 0.5, evidence: "ejemplo" },
];
