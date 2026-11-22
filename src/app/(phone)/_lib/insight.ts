import type { Kind, PublicTopic } from "@/lib/types";
import type { MatchItem } from "./matches";
import { cap } from "./people";

// "Recomendación IA", frontend only for now: a stand-in for what your Agent would answer when it
// reads both public profiles. Deterministic, so the same two people always get the same reading.
// When the backend is ready, recommend() and discover() are what a model call replaces.

type Verdict = "si" | "quizas" | "no";
export type Insight = { verdict?: Verdict; headline: string; reason?: string; points: string[]; opener?: string };

type Profile = { name: string; topics: PublicTopic[]; items: MatchItem[] };

const WANTS: Kind[] = ["busca", "quiere_ser"];
const KNOWS: Kind[] = ["sabe", "hace", "es", "ofrece"];

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

/** Broad areas, so "Fintech de pagos" and "Desarrollador fintech" or "Jazz" and "Piano" meet. */
const AREAS: { label: string; plan: string; words: string[] }[] = [
  { label: "Datos", plan: "cruzar datos o análisis en un proyecto", words: ["sql", "bigquery", "datos", "data", "analytics", "analisis", "estadistica", "dashboard", "etl"] },
  { label: "IA", plan: "probar un caso con Agentes o modelos", words: ["ia", "inteligencia artificial", "agentes", "llm", "machine learning", "modelos", "nlp"] },
  {
    label: "Software",
    plan: "armar algo juntos o revisar código",
    words: ["desarrollo", "desarrollador", "programacion", "python", "javascript", "typescript", "react", "nextjs", "node", "full stack", "cloud", "firebase", "ingeniero", "backend", "frontend", "software", "ruby", "rails", "realidad virtual"],
  },
  { label: "Emprendimiento", plan: "explorar una idea de negocio o un socio", words: ["startup", "fintech", "emprend", "negocio", "inversion", "producto", "pagos", "socio tecnico", "cofundador", "fundar", "ventas"] },
  { label: "Diseño", plan: "colaborar en un producto o una pieza visual", words: ["diseno", "ux", "ui", "figma", "ilustracion", "arte", "fotografia", "video", "cine"] },
  { label: "Música", plan: "ir juntos a un concierto", words: ["jazz", "musica", "guitarra", "piano", "rock", "banda", "canto", "vinilo"] },
  { label: "Aire libre", plan: "salir a moverse un fin de semana", words: ["escalada", "trekking", "running", "montana", "bici", "ciclismo", "surf", "futbol", "yoga", "natacion", "naturaleza", "deporte"] },
  { label: "Comida", plan: "compartir una comida", words: ["cocina", "comida", "cafe", "vino", "cerveza", "gastronomia", "panaderia"] },
  {
    label: "Aprender",
    plan: "intercambiar mentoría o ir a un hackathon",
    words: ["mentoria", "ensenar", "docencia", "hackathon", "comunidad", "voluntariado", "investigacion", "conocimiento", "obsidian", "lectura", "libros", "escritura"],
  },
];

const STOP = new Set(["para", "como", "with", "desde", "sobre", "entre", "hacia", "todo", "otra", "otro"]);

/** The word as written in the topic ("diseño", not "diseno"). */
const original = (name: string, w: string) => name.split(/[^\p{L}\p{N}]+/u).find((x) => norm(x) === w) ?? w;

const words = (s: string) => norm(s).split(/[^a-z0-9ñ]+/).filter((w) => w.length >= 4 && !STOP.has(w));

function areaOf(t: PublicTopic) {
  const n = norm(t.name);
  const tokens = n.split(/[^a-z0-9ñ]+/);
  // A phrase anywhere, a single word at the start of a word ("emprend" catches "emprendimiento").
  return AREAS.find((a) => a.words.some((w) => (w.includes(" ") ? n.includes(w) : tokens.some((x) => x.startsWith(w)))));
}

type Pair = { mine: PublicTopic; theirs: PublicTopic; area?: (typeof AREAS)[number]; word?: string };

/** Topics that are not the same, but close: a shared word first, then a shared area. */
function related(mine: PublicTopic[], them: Profile): Pair[] {
  const shared = new Set(them.items.map((i) => norm(i.topic)));
  const a = mine.filter((t) => !shared.has(norm(t.name)));
  const b = them.topics.filter((t) => !shared.has(norm(t.name)));
  const pairs: Pair[] = [];
  const usedA = new Set<string>();
  const usedB = new Set<string>();
  const take = (p: Pair) => {
    if (usedA.has(p.mine.name) || usedB.has(p.theirs.name)) return;
    usedA.add(p.mine.name);
    usedB.add(p.theirs.name);
    pairs.push(p);
  };
  for (const x of a) for (const y of b) {
    const w = words(x.name).find((w) => words(y.name).includes(w));
    if (w) take({ mine: x, theirs: y, word: w, area: areaOf(x) ?? areaOf(y) });
  }
  const areas = new Set(pairs.map((p) => p.area?.label));
  for (const x of a) {
    const area = areaOf(x);
    if (!area || areas.has(area.label)) continue;
    const y = b.find((t) => areaOf(t)?.label === area.label && !usedB.has(t.name));
    if (y) {
      take({ mine: x, theirs: y, area });
      areas.add(area.label);
    }
  }
  return pairs;
}

const list = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`);

/** Coincidencias: is it worth talking, and about what. */
export function recommend(mine: PublicTopic[], them: Profile): Insight {
  const n = them.name;
  const helpsYou = them.items.filter((i) => i.type === "te_ayuda").map((i) => cap(i.topic));
  const youHelp = them.items.filter((i) => i.type === "ayudas").map((i) => cap(i.topic));
  const common = them.items.filter((i) => i.type === "comun").map((i) => cap(i.topic));
  const pairs = related(mine, them);
  // A pair where one side knows what the other is after is an opportunity, not just a shared taste.
  const complementary = pairs.filter((p) => (WANTS.includes(p.mine.kind) && KNOWS.includes(p.theirs.kind)) || (KNOWS.includes(p.mine.kind) && WANTS.includes(p.theirs.kind)));

  const points: string[] = [];
  if (helpsYou.length) points.push(`${n} sabe de ${list(helpsYou.slice(0, 2))}, que tú buscas: te puede ahorrar camino.`);
  if (youHelp.length) points.push(`${n} busca ${list(youHelp.slice(0, 2))} y tú sabes de eso: puedes darle una mano.`);
  for (const p of pairs.slice(0, 2)) {
    const plan = p.area ? `; podrían ${p.area.plan}` : "";
    points.push(`Tú con ${cap(p.mine.name)} y ${n} con ${cap(p.theirs.name)}${plan}.`);
  }
  if (common.length && points.length < 3) points.push(`Ya comparten ${list(common.slice(0, 3))}.`);

  const score = 3 * (helpsYou.length + youHelp.length) + 2 * complementary.length + pairs.length + common.length;
  const verdict: Verdict = score >= 5 ? "si" : score >= 2 ? "quizas" : "no";
  const headline = { si: "Sí, vale la pena conversar.", quizas: "Puede valer la pena, sin apuro.", no: "Por ahora no es prioritario." }[verdict];
  const reason =
    verdict === "si"
      ? helpsYou.length || youHelp.length
        ? "Uno tiene lo que el otro busca, y eso rara vez se da por casualidad."
        : "Sus perfiles se tocan en más de un frente."
      : verdict === "quizas"
        ? "Hay un par de puntos en común; si se vuelven a cruzar, es un buen momento."
        : "Sus perfiles públicos casi no se cruzan todavía.";

  const opener = helpsYou.length
    ? `“¿Cómo partiste con ${helpsYou[0]}?”`
    : youHelp.length
      ? `“Vi que buscas ${youHelp[0]}, ¿en qué estás?”`
      : pairs[0]
        ? `“¿Cómo llegaste a ${cap(pairs[0].theirs.name)}?”`
        : common[0]
          ? `“¿Qué te tiene metido en ${common[0]} ahora?”`
          : undefined;

  return { verdict, headline, reason, points: points.slice(0, 3), opener };
}

/** Afinidades: what you may have in common without knowing it. */
export function discover(mine: PublicTopic[], them: Profile): Insight {
  const n = them.name;
  const pairs = related(mine, them);
  if (!pairs.length) {
    return {
      headline: "Nada escondido por ahora.",
      reason: `Lo público de ${n} y lo tuyo no se cruzan más allá de lo que ya ven. Una pregunta abierta puede destapar algo.`,
      points: [],
      opener: "“¿En qué andas metido estos días?”",
    };
  }
  return {
    headline: pairs.length > 1 ? "Tienen más en común de lo que parece." : "Hay algo en común que quizás no sabían.",
    points: pairs.slice(0, 3).map((p) =>
      p.word
        ? `Tú con ${cap(p.mine.name)}, ${n} con ${cap(p.theirs.name)}: los dos pasan por ${cap(original(p.theirs.name, p.word))}.`
        : `Tú con ${cap(p.mine.name)}, ${n} con ${cap(p.theirs.name)}: los dos en ${p.area?.label ?? "lo mismo"}.`,
    ),
    opener: `“Vi que te interesa ${cap(pairs[0].theirs.name)}, ¿cómo partiste?”`,
  };
}
