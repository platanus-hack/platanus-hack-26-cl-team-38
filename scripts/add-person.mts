import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { z } from "zod";
import { SEED_ROOMS } from "../seed/people";
import { synthesizeSeedTopics } from "../seed/synthesize";
import { TEAM_DIR, type TeamPerson } from "../seed/team";
import { embed } from "@/lib/embeddings";
import { cosine } from "@/lib/vector";
import { SignalSchema } from "@/lib/types";

const THRESHOLD = 0.6;
const SAME_PERSON_DUPLICATE = 0.75;

const USAGE = `Uso: pnpm seed:person <slug> "<Nombre>" <respuesta.json>... [--mut]

  slug        minúsculas y guiones, p. ej. "cristobal"
  Nombre      como se muestra en la sala
  respuesta   lo que devolvió Claude, ChatGPT o Gemini con seed/prompt-perfil.md
  --mut       además de la sala HACK26, entrar a la sala MUT (máximo 20 personas)`;

const args = process.argv.slice(2);
const files = args.filter((a) => !a.startsWith("--")).slice(2);
const [slug, displayName] = args.filter((a) => !a.startsWith("--"));
if (!slug || !displayName || files.length === 0) {
  console.error(USAGE);
  process.exit(1);
}

// Assistants often wrap the JSON in a ```json fence or add a line of prose around it.
function readSignals(path: string) {
  const raw = readFileSync(path, "utf8");
  const json = raw.slice(raw.indexOf("["), raw.lastIndexOf("]") + 1);
  const parsed = z.array(SignalSchema).safeParse(JSON.parse(json));
  if (!parsed.success) {
    console.error(`${path} no es un arreglo de señales válido:\n${z.prettifyError(parsed.error)}`);
    process.exit(1);
  }
  return parsed.data;
}

const signals = files.flatMap(readSignals);
const person: TeamPerson = {
  slug,
  displayName,
  rooms: args.includes("--mut") ? ["seed-hack", "seed-mut"] : ["seed-hack"],
  topics: synthesizeSeedTopics(signals),
};

const target = new URL(`${slug}.json`, TEAM_DIR);
const existed = existsSync(target);
const body = [
  "{",
  `  "slug": ${JSON.stringify(person.slug)},`,
  `  "displayName": ${JSON.stringify(person.displayName)},`,
  `  "rooms": ${JSON.stringify(person.rooms).replace(/","/g, '", "')},`,
  '  "topics": [',
  person.topics.map((t) => `    ${JSON.stringify(t).replace(/,/g, ", ")}`).join(",\n"),
  "  ]",
  "}",
  "",
].join("\n");
writeFileSync(target, body);

const bySource = Object.entries(Object.groupBy(signals, (s) => s.source)).map(([s, list]) => `${list!.length} de ${s}`);
console.log(`${existed ? "Reescrito" : "Creado"} seed/team/${slug}.json: ${person.topics.length} tópicos desde ${bySource.join(", ")}.`);

// Same review done by hand for the first teammate: what will link, and what links only by noise.
const others = SEED_ROOMS.filter((r) => person.rooms.includes(r.id as TeamPerson["rooms"][number]))
  .flatMap((r) => r.people)
  .filter((p) => p.slug !== slug);
const owners = new Map<string, Set<string>>();
for (const p of others) for (const [name] of p.topics) owners.set(name, (owners.get(name) ?? new Set()).add(p.displayName));

const mine = person.topics.map(([name]) => name);
const theirs = [...owners.keys()];
const vectors = await embed([...mine, ...theirs]);
const vecOf = (i: number) => vectors[i];

console.log(`\nSe enlaza con (coseno ≥ ${THRESHOLD}). Si un par no tiene relación, cambia el nombre del tópico en el JSON:`);
let links = 0;
mine.forEach((name, i) => {
  const hits = theirs
    .map((other, j) => ({ other, score: cosine(vecOf(i), vecOf(mine.length + j)) }))
    .filter((h) => h.score >= THRESHOLD)
    .sort((a, b) => b.score - a.score);
  for (const { other, score } of hits) {
    links++;
    console.log(`  ${score.toFixed(2)}  ${name} ~ ${other} (${[...owners.get(other)!].join(", ")})`);
  }
});
if (links === 0) console.log("  ninguno");

const duplicates: string[] = [];
for (let i = 0; i < mine.length; i++) {
  for (let j = i + 1; j < mine.length; j++) {
    const score = cosine(vecOf(i), vecOf(j));
    if (score >= SAME_PERSON_DUPLICATE) duplicates.push(`  ${score.toFixed(2)}  ${mine[i]} ~ ${mine[j]}`);
  }
}
if (duplicates.length > 0) console.log(`\nTópicos tuyos casi iguales (conviene juntarlos en uno):\n${duplicates.join("\n")}`);

console.log("\nSiguiente: revisa el JSON, después `pnpm seed:build && pnpm seed` y haz commit de seed/team y seed/rooms.json.");
