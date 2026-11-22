# Idea maestra · nombre por definir

*Documento maestro de la idea del equipo para Platanus Hack 26 (nombre por definir): cuando personas están cerca, sus agentes de IA dialogan y crean un nodo de oportunidades de conexión (lo que son, saben y quieren ser), guardado peer-to-peer y filtrado por capas de privacidad que configura cada usuario.*

Fuente de verdad de la **visión** de la idea: el problema, qué es nuevo y el calce con el track.

> **Estado:** idea en desarrollo. Lo marcado **Decidido** es acuerdo del equipo. Lo marcado **Por definir** o **A considerar** no es decisión. El nombre está por definir; la animación usa "Conecta" como nombre de trabajo.

> **Alcance del hack.** El 21-11 se decidió construir solo la **capa pública** y diseñar para **3 o más personas** ([arquitectura-por-capas](arquitectura-por-capas.md)). Las capas por círculo, el peer-to-peer, los nodos de pareja y los lugares o empresas siguen siendo visión, fuera del hack. Donde este documento dice "nodo de relación", en el hack es la **mesa** y su nodo de grupo.

## En una frase

Cuando dos o más personas están cerca, sus agentes de IA dialogan y crean un **nodo de oportunidades**: qué pueden conversar, aprenderse o hacer juntas, a partir de lo que cada una es, sabe y **quiere ser**. Ese nodo queda guardado en el teléfono de cada participante.

## Problema

> Hipótesis del equipo. **Aún no se validan** con usuarios ni con datos.

**Principal.** Tienes al lado a personas que podrían ayudarte, enseñarte o acompañarte en lo que buscas, y no lo sabes. Descubrirlo depende del azar y de muchas conversaciones superficiales.

**Secundarios.**
- Ya le cuentas mucho a tu agente de IA (qué sabes, qué te interesa, qué quieres aprender), pero esa información solo te sirve frente a la pantalla, no para conocer gente en persona.
- Para conectar tienes que exponerte. Hoy compartes todo o nada; no hay forma de mostrar más a tus amigos y menos a un desconocido.
- Lo que descubriste de alguien se olvida después del encuentro.

## Qué recibe el usuario

Por cada encuentro, un **nodo de relación** accesible desde su app, con tres tipos de contenido:

| Tipo | Ejemplo |
|---|---|
| Coincidencias | Ambos hacen montaña (escalada + trekking). |
| Complementos | Ana sabe UX; Bruno necesita mejorar el onboarding de su app. |
| Aspiraciones | Ana quiere emprender en fintech; Bruno fundó una fintech. |

De ahí salen **oportunidades de conversación o conexión** concretas ("Ana podría revisar el onboarding de Bruno; Bruno podría contarle cómo levantó su startup"). Las coincidencias por sí solas no son el objetivo.

## Qué es nuevo (decidido)

1. **El matching lo hacen dos agentes trabajando juntos**, no un cruce de tags. Comparan lo que cada persona es, sabe, conoce y busca, incluidas sus aspiraciones, y proponen oportunidades que ninguna lista de preferencias mostraría.
2. **Un nodo por relación.** Cada encuentro deja un nodo propio, accesible para cada participante, que crece con el grafo personal.
3. **Capas de privacidad configurables.** No solo privada y pública: el usuario define varias capas (p. ej. familia, amigos, público) y cada encuentro usa la capa que corresponde a esa relación. *Fuera del hack: solo capa pública.*
4. **Datos peer-to-peer.** Cada usuario guarda en su app su grafo y los nodos de sus relaciones. El nodo de una relación queda duplicado en todos los participantes (redundancia intencional). No hay una base central con los perfiles. *En el hack, el nodo personal vive en el teléfono, pero la sala es un servicio central que recibe solo las proyecciones públicas y las borra al cerrar.*

**Extensión (visión, fuera del alcance inicial salvo que se decida lo contrario):** nodos entre personas y **lugares o empresas**. Por ejemplo, una cafetería genera automáticamente un nodo con lo que conoce. La persona puede ver por dónde ha circulado, y la cafetería ve solo lo que la persona decida compartirle.

## Track: Multiplayer

**Definición oficial** (`evento`, `tracks-transcripcion`): sistemas colaborativos en tiempo real, entre personas y/o agentes. Puntos extra por coordinar muchos bots, o personas junto con agentes.

**Cómo calza** (lectura nuestra, no del jurado):

| Lo que pide el track | En la idea |
|---|---|
| Tiempo real | El encuentro físico dispara el diálogo entre agentes en el momento, con las personas presentes. |
| Personas + agentes | El agente hace la exploración; las personas usan el resultado para una conversación presencial. |
| Muchos bots (extra) | Cada mesa levanta un facilitador más un agente por miembro, y todas las mesas de la sala deliberan en paralelo (ver [arquitectura-por-capas](arquitectura-por-capas.md), capa 5). |

## Conceptos

| Concepto | Qué es |
|---|---|
| **Grafo personal** | Perfil de la persona como grafo: lo que es, sabe, conoce, le gusta y **quiere ser**. Vive en su teléfono. |
| **Conector** | Integración con el agente de IA que la persona ya usa. Rellena un resumen de la persona con un formato definido. |
| **Formato del resumen** | Estructura que llena el conector y desde la que se crea el grafo personal. |
| **Capa de privacidad** | Subconjunto del grafo que el usuario asigna a un círculo. Las capas las define el usuario. |
| **Círculo** | Grupo de personas que comparte una capa (p. ej. familia, amigos, público). |
| **Agente** | Uno por usuario. Lo representa y dialoga con los agentes de otras personas usando solo la capa permitida. |
| **Prompt de la aplicación** | System prompt fijo, igual para todos: cómo se comporta el agente en el diálogo. |
| **Prompt del usuario** | System prompt de cada persona: qué busca y en qué quiere complementarse. |
| **Proximidad** | El disparador del encuentro. Método por definir. |
| **Nodo de relación** | Resultado de un encuentro: coincidencias, complementos, aspiraciones y oportunidades. Se guarda en todos los participantes. |
| **Nodo de grupo** | Nodo de relación de tres o más personas: lo que el grupo puede hacer junto, no solo lo que todos comparten. |

## Cómo funciona

1. **Onboarding.** El agente de IA de la persona llena el resumen vía el conector; la app arma el grafo personal en el teléfono.
2. **Capas.** La persona asigna partes de su grafo a cada círculo.
3. **Encuentro.** Dos personas quedan cerca (método por definir).
4. **Capa aplicable.** Cada agente usa la capa del círculo al que pertenece la otra persona; un desconocido ve la capa pública.
5. **Diálogo.** Los agentes intercambian sus capas aplicables y buscan coincidencias, complementos y aspiraciones.
6. **Nodo de relación.** El resultado se guarda en ambos teléfonos y aparece en la app como oportunidades.
7. **Grupo.** Si se suma una tercera persona, su agente abre un diálogo con cada uno y una instancia más crea el nodo de grupo.

```
agente de IA → conector → resumen → grafo personal (en el teléfono, por capas)
encuentro → capa aplicable por círculo → diálogo entre agentes → nodo de relación (copia en cada participante)
```

## Preguntas del jurado previsibles

Respuestas del equipo, para alinear el pitch. Las marcadas **por definir** no tienen respuesta aún.

| Pregunta | Respuesta |
|---|---|
| ¿Por qué agentes y no un algoritmo de matching? | Porque se busca un matching creativo: oportunidades a partir de lo que cada uno sabe y **quiere ser**, no coincidencias de tags. Falta evidencia: ver [Evaluación](#evaluación). |
| ¿No es otra app de networking? | Cada relación genera su propio nodo, con capas de privacidad por círculo y datos peer-to-peer. Se extiende a lugares y empresas. |
| ¿Qué impacto tiene? | Usa lo que ya le cuentas a tu agente para que conozcas gente en persona, fuera de la pantalla. |
| ¿Dónde están mis datos? | En tu teléfono. El nodo de una relación queda solo en los teléfonos de quienes participaron. |
| Si es peer-to-peer, ¿dónde corre el agente? | **Propuesta para el hack:** en rutas de API sin estado que llaman a Claude. Solo reciben la capa pública y la intención de hoy, y el proveedor del LLM las ve; hay que declararlo. |
| ¿Qué impide que otro agente le saque a mi agente datos de otra capa? | En el hack no hay otras capas: cada agente solo recibe datos públicos y la intención de su dueño. Con capas por círculo, **por definir** (los mensajes del otro agente son input no confiable). |
| ¿Cómo escala a 30 personas en una sala? | **Propuesta para el hack:** no hay diálogos por par (serían 435 para 30 personas). La sala agrupa todos los tópicos en temas y solo deliberan las mesas candidatas. |

## Por definir

| Tema | Qué hay que decidir |
|---|---|
| Nombre | — |
| Método de proximidad | QR o código de sala, BLE (exige app nativa; iOS Safari no tiene Web Bluetooth), GPS (impreciso bajo techo). |
| Conector | Qué integración concreta: p. ej. servidor MCP con una herramienta para enviar el resumen, o un prompt para copiar y pegar en cualquier asistente. |
| Formato del resumen | Campos y cómo se mapean a nodos y capas. |
| Dónde corre el agente | En el teléfono, en la nube o mixto; qué datos ve el proveedor del LLM. |
| Transporte entre agentes | Cómo se hablan dos teléfonos (directo o con un relay que no guarde contenido). |
| Asignación de círculos | Cómo sabe el agente que la otra persona es amiga o desconocida. |
| Seguridad entre agentes | Cómo se garantiza que no salga nada fuera de la capa aplicable. |
| Escalado a N personas | Cuántos diálogos se corren y cuáles se filtran antes. |
| Alcance del hack | Ver abajo. |

Para el hack, [arquitectura-por-capas](arquitectura-por-capas.md) propone respuestas para la proximidad (check-in por QR o código de sala), el conector (prompt para copiar y pegar, MCP y conectores por fuente), el formato del resumen (`Signal` → `Topic`), dónde corre el agente y el escalado a N personas. El transporte entre agentes, la asignación de círculos y la seguridad entre capas no aplican mientras haya solo capa pública. El orden de construcción está en [plan-de-construccion](plan-de-construccion.md).

Notas anteriores, reemplazadas por la arquitectura donde se contradicen: [modelo-tecnico](archivo/modelo-tecnico.md) (gravedad y nodos de pareja) y [mcp-ingestion](archivo/mcp-ingestion.md) (conector MCP). El propósito de la idea, sin detalle técnico, está en [solucion-core](solucion-core.md).

## Alcance para el hack

**Decidido el 21-11:** solo capa pública y encuentros de 3 o más personas. El alcance construido está en [arquitectura-por-capas](arquitectura-por-capas.md) y [plan-de-construccion](plan-de-construccion.md); el guion de demo, en `CLAUDE.md`.

| Construido de verdad | Simulado y declarado en el pitch | Fuera (visión) |
|---|---|---|
| Fuentes y conectores → nodo personal en el teléfono | Perfiles sintéticos para llenar la sala (seed) | Capas privadas y círculos |
| Check-in a la sala, temas, roles y mesas | | Peer-to-peer entre teléfonos |
| Deliberación de agentes → plan con punto de encuentro | | Nodos de pareja y reencuentro entre eventos |
| Mesa que se activa cuando la aceptan 3 o más | | Lugares y empresas |

## Evaluación

**Por definir.** Los ganadores 2026 miden en vez de afirmar (ganadores (Lo que comparten los ganadores), patrón 2). Ideas **a considerar**: comparar con pares etiquetados a mano si los agentes encuentran más oportunidades útiles que un cruce de tags; contar fugas de datos fuera de la capa aplicable ante intentos de extracción.

## Precedentes

- **KnowAhuman** (BA 2026, track Future): matching talento–startups con agentes que conversan; 1.º del voto del público, no ganó jurado. Es el antecedente más cercano. → tracks (Future)
- **Record.AI** (Santiago 2025, 🥇 Human Enhancement): contexto de la persona que tienes enfrente en un evento; ganó adelantándose al tema ético con principios de privacidad explícitos. → ganadores (Record.AI)

## Ejemplo: la animación

Recurso: [master-idea-animacion.html](archivo/master-idea-animacion.html), animación HTML de ~80 s con controles de reproducción. Personas, gustos y lugares **ficticios**.

> **Desactualizada respecto de este documento:** muestra solo coincidencias y dos capas (privada y pública). No muestra complementos, aspiraciones, oportunidades, capas por círculo, datos peer-to-peer ni el onboarding.

**Lo que muestra hoy**

| Persona | Capa pública |
|---|---|
| Ana | Escalada, Python, Jazz, Café de grano, Cocina peruana, Diseño UX |
| Bruno | Trekking, Python, Jazz, Café de grano, Ciclismo, Startup fintech |
| Carla | Jazz, Cocina peruana, Diseño UX, Ciclismo, Café de grano, Fotografía |

| Conexión | En común |
|---|---|
| Ana + Bruno | Montaña (inferido de escalada + trekking), Python, Jazz, Café de grano |
| Ana + Carla | Cocina peruana, Jazz, Diseño UX, Café de grano |
| Bruno + Carla | Ciclismo, Jazz, Café de grano |
| Ana + Bruno + Carla | Jazz, Café de grano |

Escenas: perfil de Ana → dos capas → Bruno a 8 m → grafo Ana + Bruno → llega Carla con tres instancias → app con las coincidencias → cierre.

**Ejemplo de oportunidades** (ilustrativo, para alinear al equipo; las aspiraciones son inventadas)

| Persona | Quiere ser o aprender |
|---|---|
| Ana | Emprender en fintech |
| Bruno | Mejorar el onboarding de su app |
| Carla | Aprender a escalar |

| Conexión | Oportunidad |
|---|---|
| Ana + Bruno | Ana revisa el onboarding de Bruno; Bruno le cuenta cómo fundó su fintech. |
| Ana + Carla | Ana le enseña a escalar a Carla. |
| Ana + Bruno + Carla | Salida a la montaña: Ana guía la escalada, Bruno arma la ruta de trekking, Carla fotografía. |
