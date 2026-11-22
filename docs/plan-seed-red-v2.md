# Plan · la red del seed en el modelo de datos nuevo

*Cómo llevar `seed/network.json` (53 personas, 3 casos de coordinación) a un formato que calce con los contratos de `main` sin perder información, y qué problemas hay que decidir antes.*

> **Estado (22-11-2026):** fases 3 a 6 hechas en la rama `feat/seed-red-v2`, desde `main` en `fb42984`: `seed/network.v2.json`, `seed/network.ts` (esquema, `toV1()`, `renderProfile()`), `seed/network.test.ts` (reconstruye la v1 sin diferencias) y `pnpm seed` carga 81 usuarios y 95 conexiones aceptadas, probado contra Supabase local. Siguen abiertas las cuatro decisiones de abajo, y el juez de privacidad no corrió sobre la red (solo léxico y anclas, sin `ANTHROPIC_API_KEY`).

## Problemas encontrados

Ordenados por cuánto bloquean.

1. **El checkout local está 55 commits atrás de `main` y con trabajo sin commitear de varias sesiones.** La rama `feat/pwa-telefono` tiene cambios sin commitear en `src/lib/types.ts`, `seed/people.ts`, `seed/synthesize.ts`, `seed/team/*.json` y `seed/rooms.json`. Varios chocan con `main`: `main` reescribió `seed/synthesize.ts` (ahora envuelve `src/lib/node/synthesize.ts`) y `TOPIC_ALIASES` no existe allá; `rooms.json` va a dar conflicto seguro y hay que regenerarlo, no mezclarlo.
2. **El contrato `profile` (dieta, alergias, idiomas) solo existe en el checkout local y `main` fue por otro lado.** En `main`, `PublicProjectionSchema` y `PublicTopicSchema` son `.strict()`: un `rooms.json` con `profile` hace fallar `load-seed` y `/api/checkin`. La decisión "21-11 · seed (contrato)" del `CLAUDE.md` local no está en `main`. Lo que `main` tiene para ese rol es el **perfil detallado** (Markdown por secciones, filtrado línea a línea, guardado solo en el teléfono).
3. **Casi toda la información de coordinación es privada según la taxonomía de `main`**, así que el filtro la bota antes de que un agente la vea:
   - `salud` (sensible): marcapasos, diabetes, cirugía de cadera, asma, celiaquía, alergias.
   - `situacion_economica` (sensible): todos los presupuestos.
   - `menores` (sensible): Martina tiene 16 años y es usuaria; Agustín, Benjamín y Florencia son dependientes con edad.
   - `ubicacion_rutina` (personal): comuna y fechas en que alguien no está. El mensaje del perfil detallado pide explícitamente *"ni dónde vivo, ni cuándo viajo, ni dónde estaré"*.
   - `terceros` (personal): casi todas las restricciones nombran a otra persona ("su abuela Olga", "Agustín se aburre").

   Los casos dependen justo de esos datos (la fecha del matrimonio se decide por la cirugía de Hernán), así que hay un choque de diseño: o esos datos entran por un canal que el filtro no publique (la intención de un evento, ver I1), o se reescriben como necesidad operativa sin la causa ("no puedo subir sobre 2.500 msnm" en vez de "tengo marcapasos").
4. **Las restricciones y experiencias están en tercera persona.** El léxico del filtro está escrito en primera persona y `docs/modelo-de-datos.md` documenta que la tercera persona se le escapa ("tiene sesión con su psiquiatra" pasa). Hay que reescribirlas en primera persona antes de filtrar, o el filtro va a dejar pasar datos sensibles.
5. **Las salas de los casos no calzan con el motor de mesas.** El motor arma mesas de 3 a 5 por tema; el matrimonio tiene 16 participantes que deliberan una sola cosa. Correr el motor sobre `seed-matrimonio` va a dar mesas de "cata de vinos" o "trekking", no el plan del matrimonio. Lo que estos casos necesitan es la **sala con propósito** de `docs/casos-de-uso.md` (caso 2), que no está modelada: `rooms` no tiene propósito, organizadores ni roles.
6. **`connections` no guarda qué relación es.** Tiene origen (`sala`, `lugar`, `mesa` + etiqueta) y lo que comparten, pero no `relation` (familia, pareja, trabajo…), `detail` ("papá", "colega") ni `closeness`. Las órbitas Amigo/Conocido del teléfono viven solo en `localStorage`. Además no existe una consulta de amigos de amigos: los grados 2° y 3° hay que calcularlos aparte.
7. **Los tópicos de la red nunca pasaron por el filtro de privacidad.** `main` exige `Topic.privacy` para publicar y `pnpm seed:person` ya filtra; `network.json` se escribió a mano sin eso.
8. **Hay dependencias nuevas sobre el formato actual.** `scripts/roleplay-contexts.py`, `scripts/roleplay-assemble.py`, `scripts/build-network-graphs.mts` y los `docs/roleplay*/` leen `network.json` tal como está. Cambiar el formato en el mismo archivo los rompe.
9. **Menores en el seed.** Además del filtro, hay que decidir si una persona de 16 años puede ser usuaria en la demo. La alternativa más simple es subir a Martina a 18 o convertirla en dependiente.
10. **Detalles menores.** Los usuarios del seed no tienen clave (la primera que llegue se queda con ellos, ya documentado). `main` agregó a Benjamín y Cristóbal en `seed/team/`; la red solo conecta a Martín, Oscar y José.

## Objetivo

Un `seed/network.v2.json` donde cada dato tiene un destino en el modelo de `main` o en una propuesta explícita, más una prueba que reconstruya `network.json` (v1) desde v2 sin diferencias. "Sin perder información" queda así como un test, no como una promesa. La v1 se queda intacta mientras haya scripts que la lean.

## Destino de cada dato

| Dato de v1 | Destino en v2 | Contrato | Estado del destino |
|---|---|---|---|
| `slug`, `displayName` | `user.personId` (`seed-<slug>`), `user.displayName` | `users`, `room_members` | Existe |
| `topics` | `topics[]` con `privacy` (veredicto del filtro) | `TopicSchema` → `PublicTopic` → `user_topics` | Existe; falta correr el filtro |
| `bio`, `profile.profession`, `profile.hobbies`, `experiences` | `perfilDetallado` en Markdown, por las secciones de `buildProfilePrompt()` (Oficio, Viajes, Comida…), en primera persona | Perfil detallado (`admitProfile()`) | Existe; vive solo en el teléfono |
| `profile.diet`, `profile.languages` | Viñetas de "Comida y bebida" y "Cómo planeo y decido" del perfil detallado | Perfil detallado | Existe |
| `profile.allergies`, restricciones de `salud` | Reescritas como necesidad operativa ("necesito cocina separada sin gluten") en el perfil detallado; la causa, en `seedOnly` | Perfil detallado | Existe; hay que verificar que el filtro las deje pasar |
| Restricciones de `fecha`, `presupuesto`, `logistica` por evento | `intents[eventId]`: lo que solo ve el agente de esa persona en ese evento (disponibilidad, monto, condiciones) | `member_intents` (I1 de `docs/infra-propuestas.md`) | **Propuesta, no existe** |
| `preferencia`, `movilidad` sin causa médica | "Lo que evito" y "Cómo planeo y decido" del perfil detallado | Perfil detallado | Existe |
| `friends` | `connections[]`: `aceptada`, con `origin: { kind: "lugar", label }` (la etiqueta sale del `detail`: "universidad", "club de running") | `connections` | Existe |
| `friends[].relation`, `detail`, `closeness` | Mismo `connections[]`, en campos que hoy no tienen columna | Columnas nuevas en `connections`, u órbita del teléfono | **Por decidir** |
| `age`, `comuna`, `region` | `seedOnly`: no se publica por diseño | Ninguno | Solo seed |
| `events[]`: id, título, participantes | `rooms` (id, code, name) y `room_members` | `rooms`, `room_members` | Existe (así está hoy) |
| `events[]`: resumen, organizadores, roles, decisiones, tensiones | `purposeRoom`: propósito escrito, organizadores, rol por participante, variables | Sala con propósito | **No modelada** |
| `events[].helpers` | Se calculan desde las conexiones; quedan como expectativa en `SEED_EXPECTATIONS` y en el test | Tests | Existe |

## Fases

1. **Ponerse al día con `main` (bloquea todo lo demás).** Commitear o descartar el trabajo local por pieza, rebasar sobre `main`, regenerar `rooms.json` y decidir con el equipo qué pasa con el contrato `profile` local: la recomendación es retirarlo y usar el perfil detallado, que es lo que `main` eligió.
2. **Decisiones de equipo.** Cuatro, listadas abajo. Sin ellas, v2 igual se puede escribir, pero los destinos "por decidir" quedan en una sección `pending` del JSON.
3. **Reescritura en primera persona.** Un script genera, desde v1, el perfil detallado de cada persona (viñetas por sección) y la intención por evento. Las restricciones de salud se parten en necesidad (perfil o intención) y causa (`seedOnly`).
4. **Paso por el filtro.** Correr `classifyOnServer()` sobre tópicos y `admitProfile()` sobre cada perfil, con el juez real. Guardar el veredicto en cada tópico y listar las líneas que el filtro bota: cada una se reescribe o se mueve a `intents` o `seedOnly`, nunca se borra.
5. **Conversor y prueba de ida y vuelta.** `seed/network.v2.json` + `NetworkV2Schema` en `seed/network.ts`; test que reconstruye v1 desde v2 (`toV1(v2)` igual a `network.json`), que valida cada parte con los esquemas estrictos de `main` y que comprueba que ninguna parte publicable trae una línea `sensible`.
6. **Carga.** `load-seed` crea las conexiones con `propose_connection` y `accept_connection` (o un insert directo con las dos aceptaciones), y las intenciones si I1 entra. Los perfiles detallados no tienen tabla: para el modo demo, una ruta solo de seed que los entregue, como `/api/seed-people`.
7. **Migrar lectores.** `build-network-graphs.mts` y los scripts de roleplay pasan a leer v2. Cuando nadie lea v1, v1 se genera desde v2 o se borra.

## Decisiones que necesitamos del equipo

- **Perfil:** ¿se retira el contrato `profile` local en favor del perfil detallado? ¿Dónde guarda el servidor el perfil detallado para que lo lean los agentes del grupo? Hoy vive solo en el teléfono, y `main` lo deja anotado como pendiente.
- **Intención por evento (I1):** ¿entra `member_intents`? Es el único lugar que encaja con fechas, presupuestos y condiciones de un evento sin publicarlas.
- **Tipo de relación:** ¿`connections` suma `relation` y `closeness`, o la relación sigue siendo solo del teléfono?
- **Sala con propósito:** ¿se modela (propósito, organizadores, roles, deliberación de todo el grupo) o los tres casos se demuestran con mesas de 3 a 5?
