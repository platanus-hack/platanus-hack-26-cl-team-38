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
| `pnpm seed:prod` | Lo mismo contra Supabase en la nube, con las claves de `.env.production.local` |
| `pnpm seed:build` | Recalcula los embeddings de `seed/people.ts` → `seed/rooms.json` y reporta pares de tópicos sobre 0,60 |
| `pnpm seed:person <slug> "<Nombre>" <respuesta.json>...` | Agrega a un integrante al seed desde lo que devuelven Claude o ChatGPT con `seed/prompt-perfil.md` (ver `seed/README.md`) |
| `pnpm privacy:eval` | Mide el filtro de privacidad contra `src/lib/privacy/eval-set.ts`: qué marca cada capa, fugas y latencia. Con `ANTHROPIC_API_KEY` en `.env.local` mide también el juez |
| `pnpm test` | Vitest |
| `pnpm typecheck` / `pnpm lint` / `pnpm build` | Deben pasar antes de cada push |

## Contratos

Fuente de verdad: `src/lib/types.ts` (esquemas zod + tipos). Toda salida de LLM y todo input externo se valida con esos esquemas. Cambiar un contrato es una decisión: anotarla abajo y avisar al equipo.

**Base de datos** (`supabase/migrations/`): columnas en snake_case.

| Tabla | Contenido | Realtime |
|---|---|---|
| `rooms` | `id`, `code` (el del QR), `name` | — |
| `room_members` | `projection` (jsonb) es una `PublicProjection` | sí |
| `mesas` | `members` (jsonb) es `Mesa["members"]` | sí |
| `group_nodes` | Un `GroupNode`; `aceptado` y `comparten` en jsonb | sí |
| `deliberation_messages` | `agent` (facilitador, miembro, verificador), `content` (jsonb) | sí |

RLS: la clave publicable (teléfono) lee todo, acepta mesas y puede salir de la sala. `room_members`, `mesas` y `deliberation_messages` las escriben solo rutas de servidor con `supabaseAdmin` (`src/lib/supabase/admin.ts`). El check-in es `POST /api/checkin` con `{ roomCode, personId, displayName, topics }` (tópicos sin `embedding`): el servidor vuelve a clasificar cada tópico, calcula los embeddings y responde `{ roomId, accepted, rejected }`.

**Filtro de privacidad** (`src/lib/privacy/`): todo lo que viene de un asistente o de una fuente pasa por aquí antes de ser público. Un `Topic` solo se publica con `toPublicProjection()` (`projection.ts`), que exige un veredicto vigente en `topic.privacy` y vuelve a pasar el léxico. El veredicto lo da `classifyTopics()` (`classify.ts`): léxico y patrones (`screen()`), anclas por embedding y un juez LLM (`claude-haiku-5-5`); gana el nivel más estricto y, si el juez no responde, el tópico queda en `personal`. El servidor no confía en el teléfono: `POST /api/checkin` (`checkin.ts`) clasifica de nuevo y rechaza lo `sensible` y lo que no tenga veredicto. El teléfono pide veredictos con `POST /api/privacy/classify`, y antes de mandar señales a un sintetizador las pasa por `splitSignals()` (`signals.ts`), que retiene las que bloquea el léxico y quita `evidence`. Detalle en [`docs/onboarding-privacidad.md`](docs/onboarding-privacidad.md).

**Conector de asistente** (`src/lib/connectors/`, pantalla en `/onboarding`): el teléfono pide un permiso con `POST /api/onboarding/token` → `{ token, inbox, expiresAt }` y arma con `buildAssistantPrompt()` el mensaje que la persona pega en su asistente. El `token` va dentro del mensaje, dura 15 minutos y solo escribe; el `inbox` se queda en el teléfono y solo lee. El asistente entrega señales sin `evidence` (`IncomingSignalsSchema`) por una de tres vías: `POST /api/onboarding/signals` con `Authorization: Bearer <token>` (Claude Code), un enlace `/c#<token>/<source>/<kind>.<label>.<fuerza>/…` que la persona toca y que `/c` manda a `POST /api/onboarding/link` (chat), o el JSON como texto, que la persona pega en `/onboarding`. Las tres pasan por el filtro de privacidad al entrar (`admitSignals()`): cada señal va como `{ kind, name: label, sources: [source] }` a `classifyOnServer()` (las dos rutas) o a `POST /api/privacy/classify` (el texto pegado), y lo que sale `sensible` o sin veredicto se descarta antes de guardar nada; `personal` se conserva porque es un borrador privado. La salida mantiene el formato de entrada, `SynthesisSignal[]`, solo que filtrada. El permiso se valida antes de filtrar, para que nadie sin un token vigente haga correr al juez. El teléfono las recoge con `POST /api/onboarding/inbox` `{ inbox }`, que vacía el buzón, y las guarda como `Signal[]` en `localStorage` (`team38.signals.v1`), de donde las toma el frente B.

**Proximidad** (`src/lib/proximity/`, sin ruta ni pantalla todavía): quién está dentro del radio de quién según el GPS que reporta cada teléfono. `proximityHub` (`server.ts`) tiene un motor por sala en memoria; una ruta lo usa con `join()` → `{ session }`, `report()`, `heartbeat()`, `listen()` y `leave()`. Entra `ProximityJoinSchema` y `ProximityReportSchema`; sale `ProximityUpdateSchema` (`anchor`, `enter`, `move`, `leave`) con distancia, rumbo e incertidumbre, nunca coordenadas. El teléfono decide cuándo reportar con `createReporter()` (`reporter.ts`). Cómo conectarlo y qué promete: [`src/lib/proximity/README.md`](src/lib/proximity/README.md).

**Perfil detallado** (`src/lib/connectors/profile.ts`, prueba de concepto): además de las señales, el asistente puede escribir un archivo Markdown con el detalle que un agente necesita para planear con un grupo (viajes, comida, cómo decide). `buildProfilePrompt()` arma el mensaje, con el mismo permiso y la misma lista de qué dejar fuera que el de señales. El archivo llega por `POST /api/onboarding/profile?source=<claude|chatgpt|gemini>` con `Authorization: Bearer <token>` y el Markdown en el cuerpo (hasta 150 líneas y 12.000 caracteres): Claude Code lo sube solo, y desde el chat la persona sube o pega en `/onboarding` el archivo que le entregó su asistente. `admitProfile()` pasa cada línea por `classifyOnServer()` y descarta las `sensible` y las que el juez no alcanzó a revisar; una línea entra entera o no entra. Lo que pasa queda en el buzón como texto, el teléfono lo recoge con `POST /api/onboarding/inbox` (`{ signals, profiles }`) y lo guarda en `localStorage` (`team38.profiles.v1`), un perfil por asistente.

**Nodo y onboarding** (`src/lib/node/`, pantalla en `/onboarding`): tres pasos en el teléfono. (1) Trae tu info: el conector de asistente, con una tarjeta para Claude y otra para ChatGPT que comparten el mismo permiso. (2) Elige qué es público: `draftsFromSignals()` junta las señales en tópicos, `needsVerdict()` dice cuáles no tienen veredicto vigente, se piden a `POST /api/privacy/classify` (`fetchVerdicts()`, `src/lib/privacy/client.ts`) y `reconcile()` arma el `PersonalNode` sin perder las decisiones ya tomadas. Todo parte privado y lo `sensible` no entra. La vista previa del grafo pone lo público dentro del círculo y lo privado afuera. (3) Entra a la sala: `checkInBody()` → `POST /api/checkin`. El nodo vive en `localStorage` (`team38.node.v1`, `team38.person.v1`).

**Lo privado y el agente** (`src/lib/privacy/agent-brief.ts`): el agente de miembro recibe `agentBrief(node)` = `{ projection, personality }`. Solo la proyección pública sirve para armar mesas, citar y decidir; `personality` son los nombres de los tópicos privados con veredicto vigente y solo guían el tono (`PERSONALITY_RULE` va en el prompt). `mentionsPrivate(texto, brief)` es la compuerta determinista: una línea pública del agente que nombre un tópico privado se descarta.

**Embeddings:** `src/lib/embeddings.ts` (el check-in los calcula en `POST /api/checkin`; para lo demás el teléfono los pide a `POST /api/embed`), modelo `Xenova/paraphrase-multilingual-MiniLM-L12-v2` (384 dims, q8) con transformers.js. Corre en Node y en el navegador sin API key. Siempre usar `embed()`, que quita tildes antes de calcular (ver Decisiones).

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
- Modelos: `claude-sonnet-5-5` para el facilitador y `claude-haiku-5-5` para los agentes de miembro. El juez de privacidad se elige por deploy con `PRIVACY_JUDGE_MODEL` (`haiku` por defecto, u `opus`).
- Next.js 16 con Cache Components: leer `node_modules/next/dist/docs/` antes de usar APIs que no conozcas.
- Sin secretos en el repo (es público). Variables en `.env.example`.
- Commits chicos; `main` siempre desplegable.

## Decisiones

- **21-11 · P0/P1:** embeddings con `paraphrase-multilingual-MiniLM-L12-v2` local (transformers.js). Con gte-small y multilingual-e5, los tópicos sin relación daban ~0,75 de coseno, así que el umbral 0,60 juntaba todo; con este modelo quedan bajo ~0,3. Además corre en el teléfono sin clave.
- **21-11 · P0/P1:** `embed()` quita tildes. "cerámica" daba ≥0,6 contra fintech, trekking y crochet; "ceramica" queda bajo 0,5.
- **21-11 · P1:** los temas se calculan en memoria en el servidor (los embeddings viajan dentro de `projection`), así que no se usa pgvector.
- **21-11 · P1:** se agregó `Theme` a los contratos para que E dibuje los temas sin esperar a C.
- **21-11 · seed:** Oscar entra al seed con tópicos sintetizados desde Claude y su export de ChatGPT (señales casi iguales juntadas, preguntas de soporte descartadas), en `seed-mut` y en una sala nueva `seed-hack` (HACK26), para probar los filtros por persona. Varios nombres se cambiaron por otros más específicos ("emprender", "agentes de ia", "nuxt", "diseño de interiores") porque pasaban 0,60 contra tópicos sin relación (escalada, trekking, fintech, diseño ux).
- **21-11 · infra:** producción es Supabase en la nube más Render; Supabase en Docker queda solo para desarrollo local. En Render la app corre con `next start` en un proceso siempre encendido (`render.yaml`), no en funciones serverless.
- **21-11 · infra:** los embeddings se calculan en el servidor (`POST /api/embed`), no en el teléfono: el modelo pesa 118 MB y cada persona lo bajaría por el wifi de la sala. Cargado ocupa unos 710 MB de RAM en Linux; con 512 MB el proceso muere en el primer embedding, así que la instancia de Render es `standard` (2 GB).
- **21-11 · infra:** `room_members` entra a la publicación de Realtime para que la pantalla de sala vea llegar a la gente.
- **21-11 · E1 (teléfono, Minga):** el frontend vive en `src/app/(phone)/` y ya no habla de salas. Pestañas: **Inicio** (la pregunta del día, el carrusel "Cerca" y la entrada a **Afinidades**), **Coincidencias** (grafo por temas), **Conversaciones** (lo que tu Agente habló con otros, uno a uno y en grupos por temática) y **Perfil** (Intereses, Fuentes, Privacidad, Mi Nodo). Lo que te interesa conectar es, por defecto, lo que dejas público.
- **21-11 · E1:** una Coincidencia es alguien que estuvo cerca tuyo y comparte al menos un Interés público. La Distancia va de 5 a 50 m y con cada persona vale la menor entre la tuya y la suya. El match es por nombre normalizado (sin embeddings todavía). Afinidades ordena a tus contactos en tres órbitas: Amigos, Conocidos y Cercanía; desde Coincidencias se puede agregar a alguien como Amigo o Conocido. Las relaciones y la Privacidad se guardan solo en el teléfono.
- **21-11 · E1:** sin `NEXT_PUBLIC_SUPABASE_*` corre en **modo demo**: las personas son las del seed (`GET /api/seed-people`, sin embeddings), cada una con un encuentro y una relación de ejemplo derivados de su id, y las Conversaciones se arman desde las Coincidencias. Oscar, Martín y José (`seed/team/`) se pueden elegir en la bienvenida como perfil propio. Con Supabase, las personas salen de `room_members` a 0 m y no hay Conversaciones: **falta backend de ubicación, encuentros, relaciones y registro de Conversaciones**.
- **21-11 · E1:** el nombre del lugar sale de `GET /api/place`, que manda la posición redondeada a ~100 m a Nominatim (OpenStreetMap); el teléfono guarda solo el nombre y lo anota en "Qué salió de tu teléfono".
- **21-11 · E1 (estética):** piedra cálida arriba (`#E7E1D7`) y un panel pizarra con esquinas grandes (`#1F3138`), lo seleccionado en blanco, acento coral (`#FF5A36`) y un color por relación (Amigo `#FFB020`, Conocido `#8C9BFF`, Cercanía `#2BD4A4`). Helvetica Neue con los datos en Geist Mono; líneas en vez de tarjetas. En escritorio (≥1024 px) el teléfono va enmarcado y a la derecha va el grafo, sincronizado con el teléfono. Los textos viven en `(phone)/_lib/copy.ts`: títulos cortos y conceptos con mayúscula (Minga, Nodo, Agente, Coincidencia, Conversación, Interés, Perfil, Fuente, Ubicación, Distancia); los temas siempre con mayúscula inicial (`cap()`).
- **21-11 · E1:** Helvetica Neue es una fuente con licencia: los archivos van en `public/fonts/helvetica-neue/` pero están en `.gitignore`, porque el repo es público. En Mac e iPhone se usa la del sistema; en el resto cae a Helvetica o Arial.

- **21-11 · privacidad:** se aplicó el contrato de [`docs/onboarding-privacidad.md`](docs/onboarding-privacidad.md): `Topic.privacy` (opcional; sin él el tópico no se publica), `PublicTopicSchema` y `PublicProjectionSchema` como lista blanca estricta (un campo de más es un error), y `toPublicProjection()` se movió de `types.ts` a `src/lib/privacy/projection.ts`. El filtro son tres capas: léxico y patrones, anclas por embedding y un juez `claude-haiku-5-5` en una llamada aparte, por lotes de 4 en paralelo y sin thinking. El juez solo devuelve nivel, categoría y versión general; el motivo que ve la persona es una plantilla por categoría, porque el texto libre era la mitad de la latencia. Medido con `pnpm privacy:eval`: 0 fugas en 125 casos, 3 de 132 tópicos del seed a "Tú decides", y ~1,8 s para un perfil de 46 tópicos.
- **21-11 · privacidad:** las anclas por embedding solo suben un tópico a `personal`; no bloquean ni se usan en el check-in. Medido con `pnpm privacy:eval`: MiniLM no separa vivir un tema de saberlo ("psiquiatra" como oficio da 0,85 contra "sesiones con mi psiquiatra"; "filosofía política" del seed da 0,74), así que como bloqueo dejaban fuera oficios y, como un nivel nunca baja, el juez no podía corregirlo.
- **21-11 · privacidad:** `pnpm seed:person` pasa cada tópico por el filtro y solo escribe los `segura`. Pide `ANTHROPIC_API_KEY`; con `--sin-juez` usa solo las capas locales.
- **21-11 · privacidad:** el check-in pasa por el servidor (`POST /api/checkin`) y la migración `20261121200000_checkin_by_server.sql` quita las políticas `"check in"` y `"update own projection"`. Antes, con la clave publicable que va en cada teléfono, cualquiera insertaba una proyección sin filtro. El servidor guarda en memoria el veredicto por (`kind`, `name`, `sources`), sin persona asociada: repetir la consulta no cambia la respuesta y el check-in después del onboarding no llama al modelo. Si el juez no responde y no hay veredicto guardado, el tópico se rechaza (`sin_revisar`): con la API de Anthropic caída, quien no pasó antes por el onboarding no puede entrar con tópicos.
- **21-11 · privacidad:** contrato `SynthesisSignalSchema` (una `Signal` sin `evidence`, estricta) para lo que recibe `/api/synthesize`.
- **21-11 · privacidad:** el modelo del juez se elige con la variable `PRIVACY_JUDGE_MODEL`: `haiku` (por defecto) u `opus` (`claude-opus-5-5`). Al arrancar, el servidor escribe en el log `[privacy] juez: <modelo>`; un valor que no reconoce cae a Haiku y el log lo dice. Medido con `pnpm privacy:eval`: ninguno deja pasar un caso delicado como seguro. Haiku deja 1 a 3 de 91 sensibles en "Tú decides" y cambia entre corridas; Opus no deja ninguno y da lo mismo en cada corrida, a cambio de ~0,6 s más por perfil (2,4 s contra 1,8 s) y 40 veces el precio por token. Sonnet 5.5 clasifica igual que Opus pero tarda ~5 s, así que no es una opción. Con Opus la llamada lleva `fallbacks: "default"`: si un clasificador de seguridad rechaza el pedido, la API lo reintenta en otro modelo.
- **21-11 · onboarding:** el perfil se carga con un solo mensaje que la persona copia en `/onboarding` y pega en su asistente (ver Conector de asistente en Contratos), en vez del conector MCP de [`docs/mcp-ingestion.md`](docs/mcp-ingestion.md). Motivo: funciona desde el celular sin instalar nada y sirve en el chat y en Claude Code; el conector MCP en claude.ai pide configurarlo desde la web y un plugin solo cubre Claude Code. El chat no puede llamar a una API, pero sí escribir un enlace. El buzón vive en memoria del proceso, como el caché de veredictos. Las señales pasan por el mismo filtro de privacidad que el check-in (`classifyOnServer()`: léxico, anclas y juez) en el momento en que entran al backend, y lo `sensible` se descarta antes de guardarlo; llegan sin `evidence` y un pedido que la traiga se rechaza. Medido con Claude real y una memoria inventada llena de datos sensibles (sueldo, terapia, pareja, cliente, RUT, correo): 0 datos sensibles en las 24 entregas recibidas, sumando las versiones del mensaje que se probaron. Con herramientas (como Claude Code) llegó por la API 10 de 10. Sin herramientas (como el chat), Sonnet 5.5 entregó el enlace 3 de 3; Haiku 5.5 suele preferir no poner datos en una URL y entrega el JSON para pegar (4 de 5 con la redacción final), y en 1 de 5 se negó. Sin probar: el chat real de claude.ai en el celular, ChatGPT y Gemini. `APP_NAME` ("Nodos") es provisorio.
- **21-11 · proximidad:** entra el motor de proximidad por GPS como librería (`src/lib/proximity/`), portado del experimento 7 de `nodos-lab`, sin ruta ni pantalla. Contratos nuevos: `ProximityJoinSchema`, `ProximityReportSchema`, `ProximityNeighborSchema` y `ProximityUpdateSchema`. Prioriza encontrar a quien está en rango por sobre la exactitud: el límite se agranda 3 veces la imprecisión de ambos GPS, hasta 4 veces el radio. Medido en el simulador del experimento (200 personas, radio 25 m, error real de 15 a 25 m): los que están en rango y no se muestran bajan de 17–31 % a menos de 1 %, y con ±20 m "radio 25 m" pasa a significar "hasta unos 100 m". Bajo techo los teléfonos declararon ±14 a ±25 m, así que no sirve para decir "está a 1 m". No es el peer-to-peer que quedó fuera de alcance: cada teléfono habla con el servidor. El estado vive en memoria del proceso, como el buzón del onboarding. Sin probar: en teléfonos reales con las últimas correcciones, y detrás de una ruta de esta app. Pendiente antes de exponer una ruta: decidir quién puede entrar a una sala, porque quien reporta posiciones falsas puede ubicar a los demás y el código corto del QR no basta como llave.
- **21-11 · onboarding:** el onboarding son tres pasos en `/onboarding` (traer de Claude y ChatGPT, elegir público o privado con vista previa del grafo, entrar a la sala), y reemplaza la lista suelta de señales. Los tópicos privados no se usan para conexiones ni para lo que responde el agente: solo como personalidad (`agentBrief()`). Esto cambia el "solo capa pública" de la arquitectura para el agente de miembro, que ahora recibe también `personality`; el frente D debe pasar cada línea pública por `mentionsPrivate()`. Se descartó subir el export oficial de datos (zip de ChatGPT o de Claude): pesa cientos de MB y sintetizarlo exige mandar las conversaciones completas a un modelo, justo lo que el mensaje al asistente evita. Las operaciones del nodo se movieron de `mi-nodo/seed-source.ts` a `src/lib/node/node.ts` y el sintetizador del seed a `src/lib/node/synthesize.ts`.
- **21-11 · onboarding:** prueba de concepto del perfil detallado (ver Perfil detallado en Contratos). Las señales son de 1 a 4 palabras y no alcanzan para que un agente discuta un plan de grupo; subir las conversaciones se descartó otra vez. El perfil es texto plano y por ahora vive solo en el teléfono: para que lo usen los agentes del grupo hay que decidir dónde se guarda en el servidor. El mensaje pide primera persona porque el léxico está escrito así: en tercera persona, "su pareja y su hijo de 4 años" pasaba. Medido con el juez Haiku: de 9 líneas sensibles plantadas en un archivo inventado se descartaron 7, y pasaron 2 de nivel `personal` (empleador con ganas de renunciar, fechas de un viaje), que se conservan igual que en las señales; el filtro marca `personal` toda línea de más de 60 caracteres, así que ese nivel no sirve para separarlas. Con una memoria inventada llena de datos sensibles, Sonnet 5.5 y Haiku 5.5 escribieron 58 y 53 viñetas sin ninguno de los datos plantados, y sin herramientas entregaron el archivo en un bloque de código. Sin probar: el chat real de claude.ai y ChatGPT, y la pantalla en un navegador.

## Estado

- [x] P0 · Next.js + Tailwind + shadcn, manifest PWA, migración de Supabase, `/api/health`
- [x] P1 · Contratos (`src/lib/types.ts`) y seed (18 personas + sala de control)
- [x] Vistas de la sala sin motor: `/explorar` (plano de mesas por tema) y `/grafo` (grafo de fuerzas por tópico, con filtros "soy", mis salas, mis conexiones y tipo de enlace)
- [x] Supabase en la nube: migraciones aplicadas y seed cargado (`pnpm seed:prod`)
- [x] Deploy en Render (`render.yaml`): https://team-38-r60w.onrender.com, desde `main` del espejo `oerlandsen/platanus-hack-26-cl-team-38`
- [x] A · Conector de asistente: `/onboarding` entrega `Signal[]` desde Claude (chat o Claude Code) con un mensaje y un permiso de 15 minutos
- [x] Motor de proximidad como librería (`src/lib/proximity/`), sin ruta ni pantalla
- [x] E1 · teléfono Minga (modo demo con el seed; falta backend de ubicación, encuentros y Conversaciones)
- [x] Onboarding en tres pasos (`/onboarding`): Claude y ChatGPT → público o privado con vista previa del grafo → check-in
- [ ] Frentes A–E (resto)
