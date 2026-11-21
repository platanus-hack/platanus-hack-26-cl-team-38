import { config } from "dotenv";
import { SEED_ROOMS } from "../seed/people";
import { screenByAnchors } from "@/lib/privacy/anchors";
import { classifyTopics } from "@/lib/privacy/classify";
import { EVAL_SET, PERSONAL, SAFE, SAFE_HARD, SENSITIVE_HARD, SENSITIVE_OBVIOUS, SENSITIVE_SUBTLE, type EvalCase } from "@/lib/privacy/eval-set";
import { createAnthropicJudge, JUDGE_MODEL } from "@/lib/privacy/judge";
import { screen } from "@/lib/privacy/screen";
import { PRIVACY_LEVELS } from "@/lib/privacy/taxonomy";

config({ path: ".env.local", quiet: true });

const label = (c: { kind: string; name: string }) => `${c.kind} · ${c.name}`;
const pct = (n: number, total: number) => `${n}/${total} (${total === 0 ? 0 : Math.round((100 * n) / total)}%)`;

async function timed<T>(run: () => Promise<T>): Promise<[T, number]> {
  const start = performance.now();
  const result = await run();
  return [result, performance.now() - start];
}

const seedTopics = [
  ...new Map(SEED_ROOMS.flatMap((r) => r.people.flatMap((p) => p.topics.map(([name, kind]) => [`${kind}|${name}`, { kind, name }] as const)))).values(),
];
const groups: [string, { kind: EvalCase["kind"]; name: string }[]][] = [
  ["sensible obvio", SENSITIVE_OBVIOUS],
  ["sensible sutil", SENSITIVE_SUBTLE],
  ["sensible difícil", SENSITIVE_HARD],
  ["personal", PERSONAL],
  ["seguro", SAFE],
  ["seguro difícil", SAFE_HARD],
  ["seed", seedTopics],
];

console.log("Capas locales (cuántos tópicos marca cada una)\n");
const [, lexiconMs] = await timed(async () => EVAL_SET.map((c) => screen(c)));
await screenByAnchors([{ kind: "hace", name: "calentamiento" }]);
const [, anchorsMs] = await timed(() => screenByAnchors(EVAL_SET));
for (const [name, cases] of groups) {
  const byLexicon = cases.filter((c) => screen(c)).length;
  const anchors = await screenByAnchors(cases);
  const byAnchors = anchors.filter(Boolean).length;
  const either = cases.filter((c, i) => screen(c) || anchors[i]).length;
  console.log(`  ${name.padEnd(17)} léxico ${pct(byLexicon, cases.length).padEnd(14)} anclas ${pct(byAnchors, cases.length).padEnd(14)} cualquiera ${pct(either, cases.length)}`);
}
console.log(`\n  ${EVAL_SET.length} tópicos: léxico ${lexiconMs.toFixed(1)} ms, anclas ${anchorsMs.toFixed(0)} ms (modelo ya cargado)`);

if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
  console.log("\nSin ANTHROPIC_API_KEY: no se midió el juez. Sin juez, todo lo que no bloquea el léxico queda en `personal`.");
  process.exit(0);
}

const errors: unknown[] = [];
const judge = createAnthropicJudge({ onError: (e) => errors.push(e) });

console.log(`\nFiltro completo con ${JUDGE_MODEL}\n`);
const [results, totalMs] = await timed(() => classifyTopics(EVAL_SET, { judge }));
let unjudged = results.filter((r) => r.by === "sin_juez").length;

for (const expected of [...PRIVACY_LEVELS].reverse()) {
  const rows = EVAL_SET.flatMap((c, i) => (c.level === expected ? [results[i].privacy.level] : []));
  console.log(`  esperado ${expected.padEnd(9)} → ${PRIVACY_LEVELS.map((l) => `${l} ${rows.filter((r) => r === l).length}`).join(" · ")}`);
}

const leaks = EVAL_SET.filter((c, i) => c.level !== "segura" && results[i].privacy.level === "segura");
const softened = EVAL_SET.filter((c, i) => c.level === "sensible" && results[i].privacy.level === "personal");
const friction = EVAL_SET.flatMap((c, i) => (c.level === "segura" && results[i].privacy.level !== "segura" ? [`${label(c)} → ${results[i].privacy.level} (${results[i].by})`] : []));
console.log(`\n  Fugas (delicado clasificado como seguro): ${leaks.length}`);
for (const c of leaks) console.log(`    ${c.level}: ${label(c)}`);
console.log(`  Sensibles que quedaron en "tú decides": ${softened.length}`);
for (const c of softened) console.log(`    ${label(c)}`);
console.log(`  Seguros que piden un toque de más: ${friction.length}`);
for (const row of friction) console.log(`    ${row}`);

// The seed has no expected levels, but it is the closest thing to real profiles: whatever is held
// back here is friction a real person would see.
const [seedResults] = await timed(() => classifyTopics(seedTopics, { judge }));
const seedHeld = seedTopics.flatMap((t, i) => (seedResults[i].privacy.level === "segura" ? [] : [`${label(t)} → ${seedResults[i].privacy.level} (${seedResults[i].by})`]));
console.log(`\n  Seed: ${seedHeld.length} de ${seedTopics.length} tópicos no quedan como seguros`);
for (const row of seedHeld) console.log(`    ${row}`);

async function median(topics: typeof seedTopics): Promise<string> {
  const runs: number[] = [];
  for (let run = 0; run < 5; run++) runs.push((await timed(() => classifyTopics(topics, { judge })))[1]);
  runs.sort((a, b) => a - b);
  return `${runs[2].toFixed(0)} ms (mediana de 5, máx ${runs[4].toFixed(0)} ms)`;
}
const realPerson = SEED_ROOMS.flatMap((r) => r.people).reduce((a, b) => (b.topics.length > a.topics.length ? b : a));
const realProfile = realPerson.topics.map(([name, kind, , sources]) => ({ name, kind, sources }));
const mixedProfile = EVAL_SET.filter((_, i) => i % 4 === 0).slice(0, 30);
console.log(`\n  Latencia, ${EVAL_SET.length} tópicos de una vez: ${totalMs.toFixed(0)} ms`);
console.log(`  Latencia, perfil real del seed (${realPerson.displayName}, ${realProfile.length} tópicos): ${await median(realProfile)}`);
console.log(`  Latencia, perfil de ${mixedProfile.length} con dos tercios delicados: ${await median(mixedProfile)}`);
unjudged += seedResults.filter((r) => r.by === "sin_juez").length;
if (unjudged > 0) console.log(`\n  ${unjudged} tópicos sin veredicto del juez (quedaron en personal). Primer error: ${String(errors[0])}`);

process.exit(leaks.length > 0 || unjudged > 0 ? 1 : 0);
