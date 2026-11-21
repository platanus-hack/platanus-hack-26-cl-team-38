@AGENTS.md

# team-38 · Platanus Hack 26 (track Multiplayer)

Documento vivo del fin de semana. Cada decisión nueva va en [Decisiones](#decisiones), con la hora.

## Qué es

Cuando 3 o más personas están en la misma sala, cada una trae un **nodo personal** armado desde lo que ya saben de ella sus asistentes y apps (Claude, ChatGPT, Spotify, GitHub, Instagram). La sala agrupa los tópicos públicos en **temas**, asigna **roles** (aporta, busca, comparte) y arma **mesas** de 3 a 5 personas. Los agentes deliberan un plan concreto con punto de encuentro, y la mesa se activa cuando la aceptan 3 o más.

Diseño completo y algoritmos: [`docs/arquitectura-por-capas.md`](docs/arquitectura-por-capas.md). Orden de construcción: [`docs/plan-de-construccion.md`](docs/plan-de-construccion.md). Índice de docs: [`docs/README.md`](docs/README.md).

## Guion de demo

1. Un integrante conecta sus fuentes y ve su nodo: tópicos con el ícono de cada fuente y la profundidad.
2. Escanea el QR de la sala y escribe su intención de hoy, que solo ve su agente.
3. En el proyector, la sala muestra los temas y las mesas que se forman, con los agentes conversando en vivo.
4. Le llega "tu mesa" al teléfono: rol, plan y punto de encuentro. Acepta, y la mesa se enciende en el proyector.
5. Control negativo: la sala sin nada en común da 0 mesas.

## Fuera de alcance

Capas privadas y círculos, peer-to-peer entre teléfonos, reencuentro entre eventos, lugares y comercios, login con cuentas.

## Comandos

| Comando | Qué hace |
|---|---|
| `pnpm dev` | Servidor local |
| `pnpm db:start` / `pnpm db:stop` | Supabase local (Docker), sin los servicios que no usamos. `pnpm exec supabase status` da las claves para `.env.local` (no excluir `gotrue`: sin él no imprime las claves) |
| `pnpm seed` | Carga la sala de seed y la sala de control en Supabase (borra y recrea) |
| `pnpm seed:build` | Recalcula los embeddings de `seed/people.ts` → `seed/rooms.json` y reporta pares de tópicos sobre 0,60 |
| `pnpm seed:person <slug> "<Nombre>" <respuesta.json>...` | Agrega a un integrante al seed desde lo que devuelven Claude o ChatGPT con `seed/prompt-perfil.md` (ver `seed/README.md`) |
| `pnpm test` | Vitest |
| `pnpm typecheck` / `pnpm lint` / `pnpm build` | Deben pasar antes de cada push |

## Contratos

Fuente de verdad: `src/lib/types.ts` (esquemas zod + tipos). Toda salida de LLM y todo input externo se valida con esos esquemas. Cambiar un contrato es una decisión: anotarla abajo y avisar al equipo.

**Base de datos** (`supabase/migrations/`): columnas en snake_case.

| Tabla | Contenido | Realtime |
|---|---|---|
| `rooms` | `id`, `code` (el del QR), `name` | — |
| `room_members` | `projection` (jsonb) es una `PublicProjection` | — |
| `mesas` | `members` (jsonb) es `Mesa["members"]` | sí |
| `group_nodes` | Un `GroupNode`; `aceptado` y `comparten` en jsonb | sí |
| `deliberation_messages` | `agent` (facilitador, miembro, verificador), `content` (jsonb) | sí |

RLS: la clave publicable (teléfono) lee todo, hace check-in y acepta mesas. `mesas` y `deliberation_messages` las escriben solo rutas de servidor con `supabaseAdmin` (`src/lib/supabase/admin.ts`).

**Embeddings:** `src/lib/embeddings.ts`, modelo `Xenova/paraphrase-multilingual-MiniLM-L12-v2` (384 dims, q8) con transformers.js. Corre en Node y en el navegador sin API key. Siempre usar `embed()`, que quita tildes antes de calcular (ver Decisiones).

## Frentes

Cada frente trabaja en su carpeta y solo toca las demás vía contratos.

| Frente | Carpeta | Entrega | Listo cuando |
|---|---|---|---|
| **A · Conectores** | `src/lib/connectors/<fuente>.ts` | `Signal[]` validado | A1: un integrante pega la respuesta de ChatGPT y ve sus señales |
| **B · Nodo personal** | `src/lib/node/`, `src/app/api/synthesize/` | `PersonalNode` en IndexedDB y `PublicProjection` en `room_members` | Tres integrantes aparecen en la sala con sus proyecciones |
| **C · Motor de sala** | `src/lib/room/` (funciones puras, sin LLM, TDD) | `(roomId, PublicProjection[]) → { themes: Theme[]; mesas: Mesa[] }` | Pasan los tests contra `seed/` (abajo) |
| **D · Deliberación** | `src/lib/deliberation/`, `src/app/api/deliberate/` | `GroupNode` verificado + mensajes en `deliberation_messages` | Un plan con cita inventada se descarta |
| **E · Interfaces** | `src/app/(phone)/`, `src/app/sala/[code]/` | Teléfono y pantalla de sala | Aceptar en el teléfono activa la mesa en el proyector sin recargar |

**Tests del motor (C)**, con las expectativas en `SEED_EXPECTATIONS` (`seed/people.ts`):

- De `seed-mut` sale la mesa Ana, Bruno y Carla.
- `seed-control` da 0 mesas.
- El mismo input en otro orden da las mismas mesas.
- Nadie queda en más de 2 mesas; nadie sin mesa si hay una abierta (Kevin no tiene calce obvio).
- "machine learning" (3 expertos, ningún aprendiz) no da mesa de complemento; "juegos de mesa" da una mesa de afinidad.

D puede empezar antes que C con mesas escritas a mano sobre las proyecciones del seed.

## Convenciones

- Código e identificadores en inglés; UI y copy en español de Chile. Los términos del dominio (`mesa`, `aporta`, `cita`, `comparten`) se quedan en español porque así están en los contratos.
- Modelos: `claude-sonnet-5-5` para el facilitador y `claude-haiku-5-5` para los agentes de miembro.
- Next.js 16 con Cache Components: leer `node_modules/next/dist/docs/` antes de usar APIs que no conozcas.
- Sin secretos en el repo (es público). Variables en `.env.example`.
- Commits chicos; `main` siempre desplegable.

## Decisiones

- **21-11 · P0/P1:** embeddings con `paraphrase-multilingual-MiniLM-L12-v2` local (transformers.js). Con gte-small y multilingual-e5, los tópicos sin relación daban ~0,75 de coseno, así que el umbral 0,60 juntaba todo; con este modelo quedan bajo ~0,3. Además corre en el teléfono sin clave.
- **21-11 · P0/P1:** `embed()` quita tildes. "cerámica" daba ≥0,6 contra fintech, trekking y crochet; "ceramica" queda bajo 0,5.
- **21-11 · P1:** los temas se calculan en memoria en el servidor (los embeddings viajan dentro de `projection`), así que no se usa pgvector.
- **21-11 · P1:** se agregó `Theme` a los contratos para que E dibuje los temas sin esperar a C.
- **21-11 · seed:** Oscar entra al seed con tópicos sintetizados desde Claude y su export de ChatGPT (señales casi iguales juntadas, preguntas de soporte descartadas), en `seed-mut` y en una sala nueva `seed-hack` (HACK26), para probar los filtros por persona. Varios nombres se cambiaron por otros más específicos ("emprender", "agentes de ia", "nuxt", "diseño de interiores") porque pasaban 0,60 contra tópicos sin relación (escalada, trekking, fintech, diseño ux).

## Estado

- [x] P0 · Next.js + Tailwind + shadcn, manifest PWA, migración de Supabase, `/api/health`
- [x] P1 · Contratos (`src/lib/types.ts`) y seed (18 personas + sala de control)
- [x] Vistas de la sala sin motor: `/explorar` (plano de mesas por tema) y `/grafo` (grafo de fuerzas por tópico, con filtros "soy", mis salas, mis conexiones y tipo de enlace)
- [ ] Supabase en la nube + deploy en Vercel desde el espejo personal
- [ ] Frentes A–E
