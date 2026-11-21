# Conectores: GitHub, Spotify y Strava

*Investigación del 21-11-2026 sobre los tres conectores de API (pasos A2 y A3 del plan, más Strava, que no estaba): qué se puede usar hoy, cómo se autentica, cómo se traduce a `Signal[]`, qué riesgo de términos tiene cada uno y en qué orden construirlos.*

**Estado:** investigación. Nada de esto está implementado. Lo que cambia contratos o variables de entorno está en [Decisiones pendientes](#decisiones-pendientes) y, al aceptarse, va a `CLAUDE.md` · Decisiones. Los hechos sobre las APIs se revisaron el 21-11-2026 y cambian seguido: las fuentes están al final de cada sección.

## Resumen

| | GitHub | Spotify | Strava |
|---|---|---|---|
| Esfuerzo | 3–4 h | 4–5 h | 1,5–2 h (export) · 3–4 h (OAuth) |
| Auth | Ninguna para el usuario; token del servidor | OAuth PKCE en el navegador | OAuth con `client_secret` (ruta de servidor) |
| Quién puede conectarse | Cualquiera | 5 usuarios en lista blanca; el dueño de la app necesita Premium | 10 atletas; el dueño necesita suscripción pagada |
| Riesgo de términos | Ninguno | Medio: prohíbe pasar contenido de Spotify a IA | Alto: prohíbe mostrar los datos a otros y cualquier uso con IA |
| Profundidad máxima | 3 | 2 (gusto pasivo) | 3 (deporte registrado) |
| Kinds | `sabe`, `hace`, `le_gusta` | `le_gusta` | `hace` |
| Dónde corre | Ruta de servidor (token), respaldo REST desde el teléfono | Todo en el teléfono | Ruta solo para el intercambio de token; el resto en el teléfono |
| Problema técnico principal | Etiquetas cortas chocan en embeddings ("kotlin" ↔ "bordado" 0,89) | Sin `genres` desde feb-2026 | Sin PKCE |

**Orden propuesto:** GitHub ahora; el export de Strava en paralelo (pedir los exports hoy, llegan por correo); Spotify al final.

## Reglas comunes

Valen para los tres conectores y salen de [arquitectura-por-capas](arquitectura-por-capas.md) y [onboarding-privacidad](onboarding-privacidad.md).

- **Salida:** `Signal[]` validado con `SignalSchema.array()`. El mapeo es una función pura y determinista (mismo input, misma salida, ordenada), separada del fetch, para testearla con fixtures.
- **Etiquetas por lista permitida, no por exclusión.** Una etiqueta sale solo si está en el diccionario del conector (lenguajes, géneros, categorías de podcast, deportes). Nunca se usa como etiqueta un nombre propio: repo, organización, artista, show, club, usuario.
- **`evidence` guarda el detalle** ("TypeScript en 12 repos, último push 2026-11") y nunca sale del teléfono.
- **Etiquetas probadas contra el seed.** Con el umbral 0,60, una etiqueta corta puede calzar con tópicos sin relación. Cada diccionario lleva un test que calcula `embed()` de todas sus etiquetas y falla si alguna pasa 0,60 contra un tópico no relacionado del seed.
- **Profundidad:** la decide el sintetizador (B1), pero el conector entrega `strength` pensada para sus umbrales actuales en `seed/synthesize.ts`: ≥ 0,85 da 3, ≥ 0,6 da 2, y una segunda fuente suma 1. `le_gusta` nunca pasa de 2.
- **Callback de OAuth:** las URLs de preview de Vercel cambian en cada deploy y no sirven como redirect. Se registra `127.0.0.1:3000` para local y el dominio de producción para el teléfono.

## GitHub

### Acceso

- **Sin token, 60 peticiones por hora por IP**, y la red del evento ya estaba en 0 al probar ("API rate limit exceeded"). Los teléfonos en el Wi-Fi del evento comparten esa IP, así que llamar desde el teléfono sin token no es confiable para el demo. Desde Vercel la IP saliente es compartida: también necesita token.
- **Con `GITHUB_TOKEN` (PAT fine-grained, solo lectura pública, sin permisos):** 5.000 por hora. Va solo en Vercel y `.env.local`.
- **GraphQL:** una consulta por persona trae repos propios no fork con lenguajes por tamaño, topics, `isArchived`, `pushedAt` y repos con estrella. Cuesta unos 11 puntos de 5.000. Sin token, el respaldo es REST con 2 llamadas: `/users/{u}/repos` (ya incluye `topics` y `language`) y `/users/{u}/starred`, sin las llamadas a `/languages` por repo.
- **CORS:** REST responde `access-control-allow-origin: *`, así que el respaldo desde el teléfono funciona.
- **Sin OAuth.** Los repos privados son justo donde vive lo del empleador, el scope `repo` da lectura y escritura completas, y armarlo cuesta 2–3 h sin nada visible en el demo.

### De datos a señales

**Ruido que se descarta:** forks, `is_template`, `size == 0`, repos cuyo nombre calza con `tutorial|curso|course|bootcamp|homework|tarea|exercises|leetcode|dotfiles|.github.io`. Archivados valen × 0,5. Lenguajes ignorados: HTML, CSS, SCSS, Shell, PowerShell, Batchfile, Dockerfile, Makefile, Procfile, Nix. Jupyter Notebook cuenta como python × 0,5; HCL como terraform.

| Dato | Señal | Fuerza |
|---|---|---|
| Lenguaje con ≥ 20 % de los bytes de un repo | `sabe` | `0,35·min(1, repos/5) + 0,35·fracción de bytes + 0,30·e^(−años desde el último push / 2)` |
| Topic en 2 o más repos propios | `sabe` | 0,6–0,8 |
| Topic en 1 repo, en la lista permitida | `hace` | 0,5 |
| Lenguaje o topic en 3 o más repos con estrella | `le_gusta` | 0,4–0,6 |

- **Compuerta de profundidad 3:** la fuerza pasa de 0,84 solo si el lenguaje tiene 5 o más repos, un push en los últimos 12 meses y 100 KB o más. Es la "evidencia dura" que pide la Capa 3.
- **Estrella no es `quiere_ser`:** marcar con estrella es curiosidad, no aspiración.
- **Descripciones y READMEs** solo van a `evidence`: ahí aparecen los nombres de proyectos confidenciales.

### Nombres de etiqueta

Medido con `embed()` contra los 119 tópicos del seed:

- **Limpias tal cual:** python, typescript, javascript, ruby, c++, swift, php, elixir, machine learning, web3, blockchain. Calces útiles: typescript ↔ "javascript y typescript" 0,72; ruby ↔ "ruby on rails" 0,77.
- **Chocan:** kotlin ↔ bordado 0,89, java 0,84, cli 0,84, golang 0,82, nuxt 0,79, rust 0,74, nextjs 0,71, go ↔ trekking 0,67, docker ↔ pesca con mosca 0,63, devops ↔ bordado 0,63. "contenedores docker" sigue chocando (0,70).
- **Alternativas limpias:** "rust programming language", "java programming language", "desarrollo android con kotlin", "backend en java", "herramientas de línea de comandos", "desarrollo de videojuegos", "desarrollo de apps ios", "framework vue".
- **Por eso:** una tabla de alias de lenguaje o topic de GitHub a etiqueta probada, en `github-labels.ts`.

### Privacidad

Nunca como etiqueta: nombres de repo u organización, `company`, `location`, `bio` ni el usuario. Se descarta todo topic igual o contenido en el nombre de un repo u organización (`bancox-api`). La ruta del servidor no registra ni guarda el usuario ni la respuesta.

**Límite conocido:** quien trabaja en repos privados o de su empresa da pocas señales. Mitigación parcial: los lenguajes de `contributionsCollection.commitContributionsByRepository`, nunca los nombres.

Fuentes: [límites REST](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api), [buenas prácticas](https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api), [límites GraphQL](https://docs.github.com/en/graphql/overview/rate-limits-and-query-limits-for-the-graphql-api); llamadas en vivo con `gh api` el 21-11.

## Spotify

### Acceso

- **Modo desarrollo:** 5 usuarios por app, cada uno agregado a mano (nombre y email de Spotify) en Dashboard → Users Management. Quien no está en la lista puede iniciar sesión pero recibe 403. **El dueño de la app necesita Premium**, o la app deja de funcionar.
- **Cuota extendida:** fuera de alcance. Desde el 15-05-2025 solo la piden organizaciones con 250.000 usuarios activos mensuales, y la revisión toma hasta 6 semanas.
- **Quitado el 27-11-2024:** recommendations, audio-features y audio-analysis, related-artists, playlists destacadas y de categoría, preview URLs.
- **Quitado el 11-02-2026 para apps nuevas:** `GET /artists?ids=` y otros batch, `/artists/{id}/top-tracks`, new-releases y categories, `/users/{id}`, `/markets`. Search queda en 10 resultados. Desaparecen `followers` y `popularity` del artista, `publisher` del show, y `email`, `country` y `product` de `/me`.
- **Sin `genres` del artista.** Desde el 11-02-2026 la clave no viene para apps nuevas en modo desarrollo (no viene vacía: no viene). El plan "top artists → géneros" necesita otra fuente de géneros.
- **Sigue disponible:** `/me/top/artists` y `/me/top/tracks` (50; `short_term` ~4 semanas, `medium_term` ~6 meses, `long_term` ~1 año), `/me/shows` (con `name`, `description`, `languages`), `/me/following?type=artist`, `/me/player/recently-played`.

### Auth

- **PKCE en el navegador:** `GET accounts.spotify.com/authorize` con `response_type=code`, `code_challenge_method=S256` y `state`; el verificador (43–128 caracteres) en `sessionStorage`; después `POST /api/token` con `client_id` y `code_verifier`. El preflight desde un origen `*.vercel.app` respondió 204: CORS funciona y no hace falta ruta de servidor.
- **Tokens:** el de acceso dura 1 h; el de refresco, 6 meses desde el consentimiento. Para el hack basta un fetch en el onboarding, sin refresco.
- **Redirect:** coincidencia exacta y **`localhost` prohibido**. Registrar `http://127.0.0.1:3000/conectar/spotify/callback` y el de producción. Un teléfono no llega a 127.0.0.1: en el teléfono se prueba contra Vercel.
- **Scopes mínimos:** `user-top-read user-library-read`. Nada de playlists.
- **Variable:** `NEXT_PUBLIC_SPOTIFY_CLIENT_ID` (el client id no es secreto). El `SPOTIFY_CLIENT_ID` actual de `.env.example` no llega al navegador.

### De datos a señales

- **Música:**
  - Top artists de los tres rangos, con pesos 0,4 (`long_term`), 0,4 (`medium_term`) y 0,2 (`short_term`); cada artista pesa `peso del rango × (1 − posición/50)`.
  - **Géneros desde MusicBrainz** (`/ws/2/artist/?query=artist:"X"&fmt=json`, que devuelve `tags` con conteo y CORS abierto): para los ~20 artistas principales, a 1 petición cada 1,1 s, con caché en IndexedDB y un mapa fijo de ~60 artistas como respaldo (MusicBrainz responde 503 cuando está saturado).
  - Cada tag se normaliza y se mapea a un género paraguas en español con un diccionario de ~40 entradas ("modal jazz", "post-bop" → "jazz"). Se descartan tags que no son género: nacionalidad (además es `origen`) y década.
  - Salida: los 5 géneros principales con puntaje ≥ 0,25, como `le_gusta` con `strength = min(0,66, puntaje)` y la evidencia "Bill Evans, Chet Baker (top long_term)".
- **Podcasts:** `/me/shows`, clasificado por palabras clave del nombre y la descripción en una lista cerrada (historia, ciencia, tecnología, negocios, deporte, cine, comedia, diseño…). Sale "podcasts de <tema>", `le_gusta`, fuerza ≤ 0,6, que calza con "podcasts de historia" del seed. El nombre del show va solo a `evidence`.
- **Top tracks:** opcional, solo suma peso a los artistas.

### Términos

La [Developer Policy](https://developer.spotify.com/policy/) prohíbe "ingest Spotify Content into a machine learning or AI model". Mandar nombres de artistas o shows a `/api/synthesize` (Claude) probablemente la infringe. **Propuesta:** Spotify se mapea de forma determinista en el teléfono, y al LLM y a `embed()` llegan solo nuestras etiquetas (los tags de MusicBrainz pasados por el diccionario).

### Datos sensibles

Además de la lista permitida, una lista de bloqueo sobre tags, nombre y descripción descarta la señal entera, sin dejarla ni en `evidence`:

| Categoría | Ejemplos de palabras |
|---|---|
| Religión | gospel, christian, worship, alabanza, adoración, cristiana, católica, nasheed, bhajan, hymn |
| Política | política, partido, elecciones, izquierda, derecha, conservative, libertarian |
| Sexualidad y género | lgbt, queer, gay, lesbian, trans, drag, pride |
| Salud | salud mental, ansiedad, depresión, terapia, sobriedad, fertilidad, embarazo, crianza |
| Origen | tags de país o nacionalidad |

No se leen playlists ni recently-played.

### Respaldo

1. **Datos de ejemplo:** un JSON de top artists y shows capturado de un integrante, cargado con "usar datos de ejemplo", por el mismo mapeo.
2. **Pegar una lista de artistas** (o los de un Wrapped) en un textarea → MusicBrainz → mapeo.
3. **Export "Descargar tus datos"** (`YourLibrary.json`): tarda días, solo si alguien ya lo tiene.

Las personas del seed ya traen tópicos de Spotify, así que la sala y el control negativo no dependen del OAuth.

Fuentes: [modos de cuota](https://developer.spotify.com/documentation/web-api/concepts/quota-modes), [migración feb-2026](https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide), [TechCrunch 06-02-2026](https://techcrunch.com/2026/02/06/spotify-changes-developer-mode-api-to-require-premium-accounts-limits-test-users/), [top items](https://developer.spotify.com/documentation/web-api/reference/get-users-top-artists-and-tracks), [shows guardados](https://developer.spotify.com/documentation/web-api/reference/get-users-saved-shows), [PKCE](https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow), [refresco](https://developer.spotify.com/documentation/web-api/tutorials/refreshing-tokens), [redirect URIs](https://developer.spotify.com/documentation/web-api/concepts/redirect_uri), [genres ausente (mar-2026)](https://github.com/jwilsson/spotify-web-api-php/issues/287), [MusicBrainz 503](https://github.com/jellyfin/jellyfin/issues/18084), [seguimiento de cambios (oct-2026)](https://vorplabs.com/agent-tools/spotify-api-changes).

## Strava

### Términos: el problema principal

La [API Policy](https://www.strava.com/legal/api_policy) vigente desde el 01-06-2026, en lectura estricta, no permite nuestro caso:

- **§2.3 y §6.2:** los datos de un usuario se muestran "only to that user". Un tópico "ciclismo · Strava · 3" en el proyector de la sala es mostrarlo a otros. §5.13 lo permite con "prior express consent" y §6.1 trae una excepción poco clara para apps de hasta 9.999 usuarios: las dos se pueden argumentar, ninguna es segura. El acuerdo de nov-2024 ya decía lo mismo ([prensa, 15-11-2024](https://press.strava.com/articles/updates-to-stravas-api-agreement)).
- **§5.3:** prohíbe el uso "in connection with the… operation of any AI Application", y nombra embeddings, RAG e "ingestion into a context window". Cubre también **datos derivados y anonimizados**, o sea, nuestro tópico.
- **§5.5:** nada de datos derivados en almacenes vectoriales. **§6.2:** caché de 7 días como máximo. **§6.3:** las eliminaciones se reflejan en 48 h.

Mapear sin LLM baja el riesgo, pero no lo quita: la etiqueta igual pasa por `embed()` y llega a los agentes de la deliberación.

### Acceso

- **Cupo:** toda app nueva parte en "Single Player Mode" con 1 atleta; se sube a **10 sin revisión** desde el dashboard. El equipo cabe.
- **Suscripción:** crear una app exige suscripción pagada de Strava desde el 01-06-2026 (US$11,99 al mes), y cada cuenta tiene una sola app.
- **Límites:** 100 lecturas cada 15 min y 1.000 al día (el doble con 10 atletas). Una sincronización usa 2–3 llamadas.
- **Clubes:** los endpoints de miembros, actividades y admins de clubes se quitaron el 01-09-2026.

### Auth

- **Sin PKCE ni cliente público.** El intercambio del código y cada refresco exigen `client_secret`, que vive en una ruta de Next.js y en Vercel. La ruta solo reenvía el intercambio y devuelve los tokens, no el objeto del atleta.
- **CORS abierto** en `/api/v3/*` y `/oauth/token` (probado el 21-11), así que el teléfono llama a la API directo y la evidencia no pasa por nuestro servidor.
- **Scopes:** `read,activity:read`. Nada de `profile:read_all` (ciudad, peso, sexo) ni `activity:read_all` (zonas privadas). La persona puede desmarcar scopes: revisar el `scope` que vuelve.
- **Tokens:** el de acceso dura 6 h; el de refresco **rota** y el anterior muere al emitir uno nuevo.
- **Callback:** un solo dominio por app (el de producción); `localhost` y `127.0.0.1` siempre funcionan.

### De datos a señales

- **Llamadas:** `GET /athlete/activities?after=<hace 90 días>&per_page=200` (`sport_type`, `distance`, `moving_time`, `start_date`) más, opcional, `GET /athletes/{id}/stats` (totales históricos, solo ride, run y swim) para subir profundidad.
- **Kind:** `hace` para todo deporte.
- **Profundidad:** `strength = min(1, 0,5·frecuencia + 0,3·volumen + 0,2·recencia)`.
  - **3:** 24 o más sesiones en 90 días (~2 por semana) y actividad en los últimos 30, o más de 150 en total.
  - **2:** 6 o más en 90 días, o 30 o más en total.
  - **1:** 1 a 5, o la última hace más de 90 días.
- **Evidencia:** "31 sesiones de ciclismo en 90 días, 1.240 km". Nunca `start_latlng`, `map`, `location_*`, horas del día, equipo, frecuencia cardíaca ni ciudad (`ubicacion_rutina`). Esos campos se descartan en el parseo con zod.

| `sport_type` | Etiqueta |
|---|---|
| Run, TrailRun, VirtualRun | running |
| Ride, GravelRide, VirtualRide, EBikeRide | ciclismo |
| MountainBikeRide, EMountainBikeRide | mountain bike |
| Hike | trekking |
| RockClimbing | escalada |
| Swim | natación |
| Surfing | surf |
| Yoga | yoga |
| WeightTraining, Crossfit | entrenamiento de fuerza |
| Tennis, Padel, Soccer | tenis, pádel, fútbol |
| AlpineSki, Snowboard | esquí, snowboard |
| Rowing, Kayaking | remo, kayak |

Se descartan los genéricos (Walk, Workout, Elliptical, StairStepper) y los cercanos a salud (PhysicalTherapy, Wheelchair, Handcycle). Las etiquetas coinciden con las del seed (`ciclismo`, `trekking`, `escalada`, `running`, `surf`, `yoga`, `entrenamiento de fuerza`).

### Camino recomendado: el export

Cada integrante pide su archivo (Settings → My Account → Download or Delete Your Account → Request your archive), le llega un `.zip` por correo, y sube solo `activities.csv`, que se lee en el teléfono con la misma tabla y la misma heurística. Son datos propios de la persona (§6.6 reconoce el derecho a exportarlos), no salen de la API, y se evitan la suscripción, el cupo y casi todo el riesgo de términos. Mantiene la profundidad 3.

- **Pedir los exports hoy:** llegan con demora.
- **Por confirmar con un export real:** los nombres exactos de columnas (se esperan "Activity Type", "Activity Date", "Distance", "Moving Time").
- **Último recurso:** deporte autodeclarado, `hace` con tope de profundidad 2 (sin evidencia dura).

### Cambio de contrato

`strava` no está en `SourceSchema`. Agregarlo toca:

- `src/lib/types.ts` (`SourceSchema`).
- `src/app/explorar/palette.ts`: `SOURCE_LABEL` es `Record<Source, string>`, así que typecheck falla hasta agregarlo. Lo usan `explorar/explorer.tsx` y `grafo/graph-explorer.tsx`.
- `docs/arquitectura-por-capas.md`: el tipo `Source` y la tabla de Capas 1–2.
- `seed/team.ts` lo hereda vía `SourceSchema`. Opcional: tópicos de Strava en `seed/people.ts` y `pnpm seed:build`.
- `CLAUDE.md` · Decisiones. La base no cambia: las fuentes viajan en jsonb.

Fuentes: [primeros pasos](https://developers.strava.com/docs/getting-started/), [límites](https://developers.strava.com/docs/rate-limits/), [autenticación](https://developers.strava.com/docs/authentication/), [changelog](https://developers.strava.com/docs/changelog/), [actualización del programa](https://communityhub.strava.com/insider-journal-9/an-update-to-our-developer-program-13428), [sin PKCE (sep-2026)](https://github.com/openzigs/onyourleft/issues/462), [resumen de cambios 2026 (tercero)](https://appsforstrava.com/blog/strava-developer-program-changes-2026).

## Decisiones pendientes

| # | Decisión | Propuesta | Bloquea |
|---|---|---|---|
| K1 | `GITHUB_TOKEN` del servidor | Sí: PAT fine-grained de solo lectura pública, vacío en `.env.example` | GitHub |
| K2 | Agregar `strava` a `SourceSchema` | Sí, con el camino del export | Strava |
| K3 | Strava por API | No por ahora; solo si el equipo acepta el riesgo de §2.3 y §5.3 | Strava OAuth |
| K4 | Spotify nunca llega al LLM | Sí: mapeo determinista en el teléfono, solo etiquetas propias salen | Spotify, B1 |
| K5 | Quién registra la app de Spotify | Un integrante con Premium; lista blanca con los emails de los 5 | Spotify |
| K6 | `NEXT_PUBLIC_SPOTIFY_CLIENT_ID` en vez de `SPOTIFY_CLIENT_ID` | Sí | Spotify |
