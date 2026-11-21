import type { Kind, Source } from "@/lib/types";

// Hand-written source of truth for the seed. `pnpm seed:build` adds embeddings and writes rooms.json.
// Topics are already post-synthesis: passive taste (spotify, instagram likes) never exceeds depth 2,
// and depth 3 always has sabe/hace evidence.

type SeedTopic = [name: string, kind: Kind, depth: 1 | 2 | 3, sources: Source[]];
export type SeedPerson = { slug: string; displayName: string; topics: SeedTopic[] };
export type SeedRoom = { id: string; code: string; name: string; people: SeedPerson[] };

// Real person (team-38): topics synthesized from what Claude knows about Oscar plus his ChatGPT export.
// Near-duplicate ChatGPT signals were merged (guitarra eléctrica, gym, gifs) and one-off support questions dropped.
const oscar: SeedPerson = {
  slug: "oscar",
  displayName: "Oscar",
  topics: [
    ["fintech", "es", 3, ["claude", "chatgpt"]],
    ["kubernetes", "sabe", 3, ["claude"]],
    ["ruby on rails", "sabe", 3, ["claude"]],
    ["experiencia de desarrollo", "sabe", 3, ["claude", "chatgpt"]],
    ["agentes de inteligencia artificial", "hace", 3, ["claude"]],
    ["terraform", "sabe", 2, ["claude"]],
    ["python", "hace", 2, ["claude"]],
    ["hackathons", "hace", 2, ["claude"]],
    ["guitarra eléctrica", "hace", 3, ["claude", "chatgpt"]],
    ["equipamiento de audio", "sabe", 2, ["chatgpt"]],
    ["entrenamiento de fuerza", "hace", 3, ["chatgpt"]],
    ["básquetbol", "hace", 3, ["chatgpt"]],
    ["decoración del hogar", "le_gusta", 2, ["chatgpt"]],
    ["edición fotográfica", "le_gusta", 2, ["chatgpt"]],
    ["animación de gifs", "le_gusta", 2, ["chatgpt"]],
    ["reparar guitarras eléctricas", "busca", 1, ["chatgpt"]],
    ["construir muebles a medida", "busca", 1, ["chatgpt"]],
    ["preparación física para básquetbol", "busca", 1, ["chatgpt"]],
    ["framework nuxt", "busca", 1, ["chatgpt"]],
    ["fundar una startup", "quiere_ser", 1, ["claude"]],
  ],
};

const mut: SeedPerson[] = [
  // Montaña case from master-idea: Ana and Bruno aporta, Carla busca, all three share photography.
  {
    slug: "ana",
    displayName: "Ana",
    topics: [
      ["escalada", "sabe", 3, ["claude", "instagram"]],
      ["diseño ux", "sabe", 3, ["claude", "github"]],
      ["python", "sabe", 2, ["github"]],
      ["fintech", "quiere_ser", 1, ["claude"]],
      ["fotografía de naturaleza", "le_gusta", 2, ["instagram"]],
      ["jazz", "le_gusta", 2, ["spotify"]],
    ],
  },
  {
    slug: "bruno",
    displayName: "Bruno",
    topics: [
      ["trekking", "hace", 3, ["claude", "instagram"]],
      ["fintech", "es", 3, ["claude", "github"]],
      ["python", "sabe", 2, ["github"]],
      ["diseño ux", "busca", 1, ["claude"]],
      ["fotografía de naturaleza", "le_gusta", 2, ["instagram"]],
      ["jazz", "le_gusta", 2, ["spotify"]],
    ],
  },
  {
    slug: "carla",
    displayName: "Carla",
    topics: [
      ["escalada", "quiere_ser", 1, ["chatgpt"]],
      ["fotografía de naturaleza", "hace", 2, ["instagram", "chatgpt"]],
      ["cocina peruana", "hace", 2, ["chatgpt", "instagram"]],
      ["jazz", "le_gusta", 2, ["spotify"]],
    ],
  },
  // Pure affinity: four people who only share (le_gusta at depth 2 is never aporta or busca).
  {
    slug: "diego",
    displayName: "Diego",
    topics: [
      ["juegos de mesa", "le_gusta", 2, ["instagram"]],
      ["ciclismo", "hace", 3, ["claude", "instagram"]],
    ],
  },
  {
    slug: "elena",
    displayName: "Elena",
    topics: [
      ["juegos de mesa", "le_gusta", 2, ["chatgpt"]],
      ["ilustración", "sabe", 3, ["chatgpt", "instagram"]],
    ],
  },
  {
    slug: "fernanda",
    displayName: "Fernanda",
    topics: [
      ["juegos de mesa", "le_gusta", 2, ["instagram"]],
      ["ilustración", "quiere_ser", 1, ["claude"]],
    ],
  },
  {
    slug: "gabriel",
    displayName: "Gabriel",
    topics: [
      ["juegos de mesa", "le_gusta", 2, ["spotify", "instagram"]],
      ["podcasts de historia", "le_gusta", 2, ["spotify"]],
    ],
  },
  // Three experts and no learner: the theme must not produce a complement mesa.
  {
    slug: "hugo",
    displayName: "Hugo",
    topics: [
      ["machine learning", "sabe", 3, ["github", "claude"]],
      ["python", "sabe", 3, ["github"]],
    ],
  },
  {
    slug: "ines",
    displayName: "Inés",
    topics: [
      ["machine learning", "sabe", 3, ["github"]],
      ["cerámica", "hace", 2, ["instagram"]],
    ],
  },
  {
    slug: "javier",
    displayName: "Javier",
    topics: [
      ["machine learning", "sabe", 3, ["github", "chatgpt"]],
      ["vinos naturales", "le_gusta", 2, ["instagram"]],
    ],
  },
  // No obvious match: exercises the "nadie solo" rule.
  {
    slug: "kevin",
    displayName: "Kevin",
    topics: [
      ["apicultura", "hace", 1, ["chatgpt"]],
      ["tejido a crochet", "le_gusta", 2, ["instagram"]],
    ],
  },
  {
    slug: "lucia",
    displayName: "Lucía",
    topics: [
      ["open banking", "sabe", 3, ["github", "claude"]],
      ["fintech", "quiere_ser", 1, ["claude"]],
      ["ciclismo", "le_gusta", 1, ["instagram"]],
    ],
  },
  // Second complement mesa: one expert, two learners.
  {
    slug: "mateo",
    displayName: "Mateo",
    topics: [
      ["surf", "hace", 3, ["instagram", "claude"]],
      ["cerámica", "le_gusta", 1, ["instagram"]],
    ],
  },
  {
    slug: "nico",
    displayName: "Nico",
    topics: [
      ["surf", "quiere_ser", 1, ["chatgpt"]],
      ["podcasts de historia", "le_gusta", 2, ["spotify"]],
    ],
  },
  {
    slug: "olivia",
    displayName: "Olivia",
    topics: [
      ["surf", "le_gusta", 1, ["instagram"]],
      ["vinos naturales", "le_gusta", 2, ["instagram"]],
    ],
  },
  {
    slug: "pia",
    displayName: "Pía",
    topics: [
      ["cocina peruana", "busca", 1, ["claude"]],
      ["yoga", "hace", 2, ["instagram"]],
    ],
  },
  {
    slug: "rafa",
    displayName: "Rafa",
    topics: [
      ["cocina peruana", "le_gusta", 1, ["instagram"]],
      ["ciclismo", "hace", 1, ["instagram"]],
    ],
  },
  {
    slug: "sofia",
    displayName: "Sofía",
    topics: [
      ["yoga", "sabe", 3, ["claude", "instagram"]],
      ["meditación", "quiere_ser", 1, ["chatgpt"]],
    ],
  },
  oscar,
];

// Negative control (O8): nothing in common, so the engine must return 0 mesas.
const control: SeedPerson[] = [
  { slug: "ximena", displayName: "Ximena", topics: [["astronomía", "sabe", 3, ["claude"]], ["rugby", "busca", 1, ["chatgpt"]]] },
  { slug: "yago", displayName: "Yago", topics: [["repostería", "hace", 3, ["instagram", "chatgpt"]], ["numismática", "le_gusta", 1, ["claude"]]] },
  { slug: "zoe", displayName: "Zoe", topics: [["k-pop", "le_gusta", 2, ["spotify"]], ["derecho tributario", "sabe", 3, ["claude"]]] },
  { slug: "walter", displayName: "Walter", topics: [["pesca con mosca", "hace", 3, ["instagram", "chatgpt"]], ["japonés", "quiere_ser", 1, ["chatgpt"]]] },
  { slug: "valeria", displayName: "Valeria", topics: [["bordado", "hace", 2, ["instagram"]], ["blockchain", "busca", 1, ["claude"]]] },
];

// A second room Oscar is in, so "only my rooms" has something to filter. People repeat across events.
const hack: SeedPerson[] = [oscar, ...mut.filter((p) => ["bruno", "hugo", "lucia", "javier", "sofia"].includes(p.slug))];

export const SEED_ROOMS: SeedRoom[] = [
  { id: "seed-mut", code: "MUT001", name: "Sala de prueba · MUT", people: mut },
  { id: "seed-hack", code: "HACK26", name: "Platanus Hack 26", people: hack },
  { id: "seed-control", code: "CTRL01", name: "Sala de control (nada en común)", people: control },
];

// What the room engine (front C) must produce from this seed. Person ids are `seed-<slug>`.
export const SEED_EXPECTATIONS = {
  "seed-mut": {
    mustIncludeMesa: ["seed-ana", "seed-bruno", "seed-carla"],
    noComplementMesaForTheme: "machine learning",
    affinityTheme: "juegos de mesa",
    noObviousMatch: "seed-kevin",
  },
  "seed-hack": {},
  "seed-control": { mesas: 0 },
} as const;
