# Casos de uso

*Los tres casos de uso de la app — conexión 1a1 (match total), sala con propósito y modo explorador — con su flujo, qué ve la persona, qué hacen los agentes y qué queda guardado. Propuesta.*

> **Estado (21-11-2026):** propuesta de Benjamín, sin acordar con el equipo. No cambia nada marcado **Decidido** en [arquitectura-por-capas](arquitectura-por-capas.md) ni en `CLAUDE.md`; donde choca, está anotado en [Cómo calza con lo decidido](#cómo-calza-con-lo-decidido). Los pesos y el techo del porcentaje son inventados y están sin calibrar. Nada se probó con usuarios ni en un teléfono físico.

Es el resumen de una nota más larga y de una maqueta navegable que están en el vault de preparación (`07-hack/casos-de-uso.md`), todavía sin subir.

## De un vistazo

| | 1 · Conexión 1a1 | 2 · Sala con propósito | 3 · Modo explorador |
|---|---|---|---|
| Personas | 2 | 2 o más | Todas las del espacio |
| Cómo parte | Acercan los teléfonos | Alguien crea la sala con un propósito escrito | Entras a un espacio con QR o código |
| Para qué sirve | Saber todo lo que tienen en común y de qué conversar | Llegar a un plan acordado | Ver con quién vale la pena hablar |
| Qué hacen los agentes | Los dos agentes cruzan todo lo que sus dueños publican | Un orquestador pregunta a cada agente y propone un plan | La sala calcula los calces con cada presente |
| Qué queda | Nodo de pareja con porcentaje | Nodo de sala con el plan | Nada, hasta que dos personas aceptan conectarse |
| Exige estar cerca | Sí | No | Sí |

Los casos se encadenan: el explorador muestra a quién conocer, la conexión 1a1 da el detalle, y una sala sirve para hacer algo juntos. Toda persona con la que quedas con un nodo, por el caso 1 o el 2, pasa a tu lista de **usuarios conectados**.

## 1. Conexión 1a1 (match total)

Dos personas acercan sus teléfonos, como al compartir un contacto, y sus agentes se presentan. **Match total** significa que se cruza todo lo que ambas publican (temas, lo que buscan, lo que ofrecen, lugares y contactos) y no un solo tema.

### Flujo

| # | La persona | Los agentes | En pantalla |
|---|---|---|---|
| 1 | Acerca el teléfono | Nada todavía | Dos burbujas frente a frente |
| 2 | Acepta "¿Presentarte con Beto?" | — | "Así te voy a presentar" y cuántos datos privados no salen |
| 3 | Espera menos de 1 s | Se cruzan las proyecciones públicas, sin modelo | Temas y contexto en común, con el primer porcentaje |
| 4 | Mira unos 30 s | Un agente pregunta y el otro responde, hasta 6 mensajes | Los turnos en vivo; cada complemento confirmado suma puntos |
| 5 | Decide con un toque si propone verse en persona | El agente envía la propuesta solo si su dueño dice que sí | Una tarjeta de autorización |
| 6 | Nada | Se escribe el nodo de pareja solo con lo autorizado | "De qué conversar", en una frase |

### Tipos de match

Ejemplos ficticios.

| # | Tipo | Ana | Beto |
|---|---|---|---|
| 1 | Idéntico | open-banking · 3 | open-banking · 2 |
| 2 | Por significado | escalada · 2 | trekking · 3 → "montaña" |
| 3 | Busca ↔ ofrece | Busca revisión regulatoria | Ofrece asesoría regulatoria |
| 4 | Intercambio mutuo | Ofrece revisar onboardings | Busca mejorar su onboarding (además del 3) |
| 5 | Misma experiencia, distinta etapa | Quiere correr su primera maratón | maratón · 3 |
| 6 | Misma búsqueda | Busca inversión semilla | Busca inversión semilla |
| 7 | Lugar, institución o evento | Estudió en la UC | Estudió en la UC |
| 8 | Contacto en común | Conectada con Mora | Conectado con Mora |

- El contacto en común se muestra sin nombre ("1 contacto en común"), porque expone a un tercero.
- A considerar, fuera del demo: **puente** (Beto no ofrece lo que buscas, pero un contacto suyo sí) y **contrapunto** (posturas opuestas sobre el mismo tema).

### Porcentaje

Cada calce visible suma puntos; el porcentaje es la suma sobre un **techo fijo de 20 puntos**.

| Calce | Puntos | Barra |
|---|---|---|
| Idéntico | Menor profundidad de los dos (1 a 3) | En común |
| Por significado | Menor profundidad × coseno | En común |
| Busca ↔ ofrece, por cada sentido | 3 | Complemento |
| Distinta etapa | 3 | Complemento |
| Misma búsqueda | 2 | Complemento |
| Lugar o contacto en común | 1 cada uno, máximo 3 | Contexto |

Ejemplo: open-banking 2 + fintech 3 + montaña 1,4 + dos complementos 6 + UC 1 = 13,4 de 20 = **67 %**.

- **Se explica solo:** tres barras y una línea por cada punto. No hay puntos sin línea.
- **Nutrir el perfil solo sube el número:** con techo fijo, publicar un tópico más o subir una profundidad nunca lo baja.
- **No revela por descarte:** solo cuenta lo que ambos publican. Lo privado no se compara con nadie, así que la app no puede decir "si publicas X subirías".

### Qué queda

Un **nodo de pareja** en cada teléfono: el desglose del porcentaje, los calces, "de qué conversar", lo pendiente de autorizar y la fecha del encuentro. No guarda preguntas sin respuesta ni nada que una parte no autorizó.

## 2. Sala con propósito

Una sesión conjunta que alguien abre con un propósito escrito. Cada persona entra con su agente y un orquestador coordina hasta llegar a un plan. Se entra por enlace o código y funciona a distancia.

| Propósito | Qué aporta cada agente | Qué propone el orquestador |
|---|---|---|
| **Organizar algo** (un viaje a Río) | Intenciones y gustos relevantes de su dueño | Un plan día por día que resuelve los choques: subgrupos, horarios, tope de gasto |
| **Resolver un conflicto** (dos socias no acuerdan cómo repartir la empresa) | La postura de su dueña y sus razones | En qué ya coinciden, el desacuerdo real en una frase y un plan para cerrarlo. Propone; no decide por ellas |
| **Centralizar una búsqueda** (cada uno investigó proveedores en su propio Claude) | Un resumen de lo que encontró | Un solo documento sin duplicados y un plan para cerrar contradicciones y vacíos |

### Flujo

1. Alguien crea la sala con el propósito en una frase y comparte el enlace, QR o código.
2. Cada persona entra y ve cómo la va a presentar su agente en esa sala.
3. El orquestador pregunta a todos los agentes en paralelo qué es relevante para el propósito. Cada agente responde solo con lo que su dueño publica.
4. El orquestador muestra a todos en qué coinciden, en qué chocan y un **plan de acción**: pasos concretos con responsable, pensados para resolver cada choque.
5. Cada persona aprueba o pide un ajuste. Un ajuste abre otra ronda solo con los agentes afectados y produce una versión nueva del plan, con lo que cambió marcado.
6. Cuando todos aprueban queda un **nodo de sala**: el plan acordado, su versión, los ajustes pedidos y quién aportó qué. La sala se puede reabrir para seguir iterando.

### Usuarios conectados

Lista en la cuenta de cada persona con todos aquellos con quienes tiene un nodo.

| Dato | Ejemplo |
|---|---|
| Nombre visible | Beto |
| Origen y fecha | Conexión 1a1 · 2026-11-21 |
| Nodos que comparten | Nodo de pareja; sala "Viaje a Río" |
| Porcentaje | Solo si hicieron la conexión 1a1 |

Entrar a una sala conecta a sus participantes con la sala como nodo compartido. El porcentaje aparece solo si dos de ellos hacen además la conexión 1a1.

## 3. Modo explorador

La persona está en un espacio delimitado (un evento, un cowork, un networking) y ve flotar, como burbujas, a las personas con las que tiene algo en común.

- **Entrar:** código de sala o QR en la puerta. El espacio caduca cuando termina el evento.
- **Interés declarado:** el espacio puede pedir un rol al entrar (founder, inversionista, mentor). El rol filtra lo que flota, pero no suma puntos: los puntos salen solo de los calces.
- **Filtro por tema:** se puede dejar flotando solo a quienes calzan con un tema propio.

| Elemento | Qué representa |
|---|---|
| Burbuja | Una persona presente con al menos un calce contigo |
| Tamaño | Porcentaje de match |
| Cercanía al centro | En el demo, también el porcentaje. Con app nativa sería la distancia física |
| Color | Tipo de calce: complemento, en común o contexto |
| Borde | Sólido: ya conectados. Punteado: solicitud pendiente |
| Doble anillo | Un grupo: tres o más personas comparten un tema contigo |

| | Antes de que ambos acepten | Después |
|---|---|---|
| Identidad | Nombre visible y rol declarado | Cómo se presenta |
| Temas y contexto en común | Sí, con sus puntos | Sí |
| Complementos | Solo cuántos son | El detalle de quién busca y quién ofrece |
| De qué conversar y contacto | No | Sí, lo que cada uno autorice |

**De burbuja a conexión:** tocas la burbuja, pides la presentación y, si la otra persona acepta, corre la conexión 1a1 desde el paso 3. Si no responde, la solicitud caduca con el espacio; no se muestra un rechazo.

**Sobre la cercanía:** la web no puede medir la distancia entre dos teléfonos ni detectar que alguien está cerca sin que abra la app. En el demo, "cerca" significa "en el mismo espacio" y las burbujas se ordenan por afinidad.

## Qué es viable en el demo

Lo "medido" viene de un laboratorio local del 21-11-2026 (`nodos-lab`, fuera de este repo).

| Pieza | Demo web | Requiere app nativa |
|---|---|---|
| Gesto de acercar teléfonos | QR o código | BLE o NFC |
| Entrar a un espacio | Código o QR de sala | Geocerca o beacon |
| Distancia entre personas | No existe | BLE |
| Conversación entre dos agentes | Medido: 25-31 s y cerca de US$ 0,002 con Haiku. Una en vivo y el resto pregeneradas | Igual |
| Sala con propósito | Completa: no depende de la cercanía. Costo por ronda sin medir | Igual |

## Cómo calza con lo decidido

| Tema | Lo que dice el repo hoy | Lo que propone esta nota |
|---|---|---|
| Tamaño del encuentro | **Decidido:** se diseña para 3 o más; el par es un caso degenerado | El caso 1 trata al par como caso propio, con porcentaje y nodo de pareja. **Choca**; lo decide el equipo |
| Privacidad | **Decidido:** solo capa pública; la persona marca qué tópicos publica | Compatible. "Compartido" aquí es la proyección pública; no hay capas por círculo |
| Deliberación | Propuesta: el facilitador propone y hay una sola revisión | El caso 2 permite varias versiones del plan. Es un cambio a esa propuesta |
| Mesas | El motor arma mesas de 3 a 5 por tema y rol | La sala con propósito la abre una persona. Una mesa equivale a una sala cuyo propósito propone el motor |
| Usuarios conectados | Fuera de alcance: login con cuentas y reencuentro entre eventos | Si se hace en el hack, la lista vive en el teléfono, sin cuenta |
| `/explorar` | Mapa de la sala: mesas por tema, visto desde la sala | El caso 3 es la vista desde una persona: quién le calza a ella |

Equivalencias de nombres: orquestador = facilitador; proyección pública = lo que esta nota llama "lo que publicas"; nodo de sala = `GroupNode`. El nodo de pareja no tiene contrato en `src/lib/types.ts`.

## Por decidir

- Si la conexión 1a1 entra al hack, dado lo decidido sobre 3 o más personas.
- Pesos y techo del porcentaje, calibrados con el seed.
- Tope de versiones del plan en una sala, y qué pasa si dos personas piden ajustes opuestos.
- En un conflicto, si el orquestador puede recibir de un agente algo que la otra parte no ve.
- Si el nombre se muestra en el explorador antes de aceptar, o solo el rol.
