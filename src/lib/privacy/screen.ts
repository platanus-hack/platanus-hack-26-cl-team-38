import type { Kind } from "@/lib/types";
import { fold, type Finding, type SensitiveCategory, type TopicInput } from "./taxonomy";

// Deterministic layer: same answer on the phone, on the server and in CI. It is deliberately
// narrow, because a level can only go up: whatever this layer blocks, no model can unblock.

const IDENTIFIERS: RegExp[] = [
  /[\w.+-]+@[\w-]+\.[\w.-]+/,
  /\b(?:https?:\/\/|www\.)\S+/,
  /(?:^|\s)@\w{2,}/,
  /\b\d{1,2}\.?\d{3}\.?\d{3}-?[\dk]\b/,
  /(?:\+?56)?\s?9[\s-]?\d{4}[\s-]?\d{4}\b/,
  /\d{7,}/,
];

type Lexicon = Record<SensitiveCategory, { always: string[]; unlessExpertise: string[] }>;

// Patterns run on folded text (no accents, lowercase). `always` is first-person status or identity;
// `unlessExpertise` is subject matter that is a confidence when you live it and plain knowledge
// when you teach it ("busca · terapia" vs "sabe · terapia cognitiva").
const LEXICON: Lexicon = {
  salud: {
    always: [
      "embarazad[ao]",
      "seropositiv[ao]",
      "vih",
      "en rehabilitacion",
      "(?:alcoholicos|narcoticos) anonimos",
      "mi (?:diagnostico|enfermedad|tratamiento|operacion|cirugia|psicolog[ao]|psiquiatra|terapeuta|medicacion)",
      "mis (?:medicamentos|remedios|pastillas)",
      "licencia medica",
    ],
    unlessExpertise: [
      "depresi\\w+",
      "ansiedad",
      "crisis de panico",
      "ataques? de panico",
      "bipolar\\w*",
      "esquizofreni\\w+",
      "tdah",
      "trastorno\\w*",
      "autis\\w+",
      "terapia(?: de pareja| psicologica)?",
      "psicoterapia",
      "antidepresiv\\w+",
      "ansiolitic\\w+",
      "salud mental",
      "cancer",
      "quimioterapia",
      "diabet\\w+",
      "epilep\\w+",
      "sida",
      "fertilidad",
      "infertilidad",
      "embarazo",
      "aborto",
      "adiccion\\w*",
      "alcoholismo",
      "drogadiccion",
      "discapacidad",
      "enfermedad cronica",
      "insomnio",
      "mental health",
      "therapy",
      "depression",
      "anxiety",
      "pregnan\\w+",
    ],
  },
  sexualidad_genero: {
    always: [
      "gays?",
      "lesbianas?",
      "bisexual(?:es)?",
      "homosexual(?:es)?",
      "transgenero",
      "transexual(?:es)?",
      "no binari[oa]s?",
      "pansexual(?:es)?",
      "asexual(?:es)?",
      "salir del closet",
      "tinder",
      "grindr",
      "bumble",
    ],
    unlessExpertise: [
      "lgbt\\w*",
      "queer",
      "orientacion sexual",
      "identidad de genero",
      "vida sexual",
      "sexualidad",
      "apps? de citas",
      "citas online",
      "poliamor\\w*",
      "drag (?:queens?|shows?|race)",
    ],
  },
  politica: {
    always: ["militante", "militancia", "afiliad[ao] a", "voto por", "vote por", "votar por", "mi sindicato"],
    unlessExpertise: [
      "partido (?:politico|comunista|socialista|republicano|liberal|nacional)",
      "comunis\\w+",
      "socialis\\w+",
      "fascis\\w+",
      "anarquis\\w+",
      "de (?:derecha|izquierda)",
      "pinochet\\w*",
      "activismo",
      "activista",
      "sindicato",
      "sindicalis\\w+",
      "plebiscito",
      "campana politica",
      "feminis\\w+",
      "conflicto (?:palestino|israeli|mapuche)",
      "politica (?:chilena|nacional|partidista)",
      "podcasts? de politica",
    ],
  },
  religion: {
    always: ["mi (?:iglesia|fe|religion|parroquia|congregacion)", "testigos? de jehova", "creyente"],
    unlessExpertise: [
      "catolic\\w+",
      "evangelic\\w+",
      "cristian\\w+",
      "musulman\\w*",
      "islam\\w*",
      "judi[oa]s?",
      "judaismo",
      "mormon\\w*",
      "budis\\w+",
      "ate[oa]s?",
      "ateismo",
      "agnostic\\w+",
      "iglesia",
      "parroquia",
      "religion",
      "religios[oa]s?",
      "oracion",
      "biblia",
      "biblic[oa]s?",
      "misa",
      "ramadan",
      "ayuno religioso",
      "retiro espiritual",
      "musica (?:cristiana|catolica|gospel)",
      "gospel",
      "worship",
    ],
  },
  origen: {
    always: [
      "indocumentad[ao]",
      "sin papeles",
      "refugiad[ao]",
      "mi (?:visa|residencia|nacionalidad|etnia)",
      "situacion migratoria",
    ],
    unlessExpertise: [
      "inmigrante",
      "migrante",
      "visa",
      "residencia (?:definitiva|temporal)",
      "tramites? migratori\\w+",
      "permiso de trabajo",
      "nacionalizacion",
      "origen etnico",
    ],
  },
  situacion_economica: {
    always: [
      "mis? (?:deudas?|sueldo|finiquito|quiebra|creditos?|hipoteca|ahorros)",
      "endeudad[ao]",
      "cesante",
      "desemplead[ao]",
      "en quiebra",
      "sin trabajo",
      "salir de (?:mis |las )?deudas",
    ],
    unlessExpertise: [
      "deudas?",
      "dicom",
      "cesantia",
      "finiquito",
      "seguro de cesantia",
      "credito de consumo",
      "repactar",
      "repactacion",
      "embargo de bienes",
      "bonos? del estado",
      "subsidio habitacional",
      "beneficios sociales",
      "quiebra personal",
    ],
  },
  legal: {
    always: [
      "antecedentes penales",
      "mi (?:juicio|demanda|divorcio|abogad[ao]|causa|denuncia)",
      "pension de alimentos",
      "orden de alejamiento",
      "libertad condicional",
    ],
    unlessExpertise: [
      "demanda (?:judicial|laboral|civil)",
      "juicio (?:oral|penal|laboral|civil|de alimentos)",
      "divorcio",
      "denuncia",
      "querella",
      "tuicion",
      "custodia de (?:mis? )?(?:hij\\w+|menores)",
    ],
  },
  menores: {
    always: [
      "mis? hij[oa]s?",
      "(?:papa|mama|padre|madre|apoderad[ao]) de \\w+",
      "colegio de (?:mis?|los|las) \\w+",
      "jardin infantil de",
    ],
    unlessExpertise: [],
  },
};

const FIRST_PERSON = /\b(?:mis?|tengo|sufro|padezco|me diagnosticaron|estoy (?:en|con)|voy al?|tomo)\b/;
const EXPERTISE: Kind[] = ["sabe", "ofrece"];

function compile(sources: string[]): RegExp | null {
  return sources.length === 0 ? null : new RegExp(`\\b(?:${sources.join("|")})\\b`);
}

const COMPILED = Object.entries(LEXICON).map(([category, tiers]) => ({
  category: category as SensitiveCategory,
  always: compile(tiers.always),
  unlessExpertise: compile(tiers.unlessExpertise),
}));

export function hasIdentifier(text: string): boolean {
  const folded = fold(text);
  return IDENTIFIERS.some((re) => re.test(folded));
}

export function screen(topic: TopicInput): Finding | null {
  const text = fold(topic.name);
  if (hasIdentifier(text)) return { level: "sensible", category: "identificable", by: "patron" };

  const livedNotTaught = !EXPERTISE.includes(topic.kind) || FIRST_PERSON.test(text);
  for (const { category, always, unlessExpertise } of COMPILED) {
    if (always?.test(text)) return { level: "sensible", category, by: "lexico" };
    if (livedNotTaught && unlessExpertise?.test(text)) return { level: "sensible", category, by: "lexico" };
  }
  return null;
}

// Free text (plans, citas, meeting points) has no kind: nothing in it counts as expertise.
export function screenText(text: string): Finding | null {
  return screen({ kind: "es", name: text });
}
