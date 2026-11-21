# Conector MCP para la carga inicial del perfil

*Carga inicial del perfil vía un conector MCP — Claude arma el nodo personal (tópicos con profundidad 1–3, busca, ofrece) a partir de lo que sabe del usuario y lo envía con una sola herramienta.*

> **Estado: en el hack es el paso A5 de [plan-de-construccion](plan-de-construccion.md)**, el primero que se corta si falta tiempo. Donde se contradice, manda [arquitectura-por-capas](arquitectura-por-capas.md):
> - `submit_profile` entrega señales (`Signal[]`) a la capa 2, que pasan por el sintetizador como las de cualquier otra fuente. `busca` y `ofrece` son `kind` de tópico, y hay que pedir también `quiere_ser`, que este formato no tiene.
> - El servidor es un **buzón efímero**: el teléfono retira el perfil y se borra. El nodo personal vive en el teléfono (IndexedDB), no en nuestro backend.
> - En el hack no hay OAuth ni cuentas: se usa un token o código de desarrollo (ver I8 en [infra-propuestas](infra-propuestas.md)).
> - El archivo `.md` con `public: [...]` lo reemplaza el campo `public` de cada `Topic`.

## Objetivo
Obtener el **nodo personal** de cada usuario a partir de su actividad en Claude: una lista de tópicos con peso, más lo que busca y lo que ofrece. Es una de las entradas de la capa 2 de [arquitectura-por-capas](arquitectura-por-capas.md); la versión anterior de este diseño partía de [modelo-tecnico](modelo-tecnico.md).

No guardamos conversaciones. Solo el perfil resultante.

## Decisión
Un **servidor MCP remoto** (un "custom connector" en Claude) con una sola herramienta, `submit_profile`. El usuario le pide a Claude "arma mi perfil"; Claude lo construye con lo que sabe de la persona y lo envía en una llamada.

**El peso es profundidad:** cuánto *sabe* la persona del tópico, no cuánto habla de él. Alguien puede preguntarle mucho a Claude sobre algo justamente porque no lo sabe. Es el `prof` que usa la fórmula de similitud del modelo.

| Profundidad | Significa (propuesta, por validar) |
|---|---|
| 1 | Interés o curiosidad: lo está aprendiendo o le gusta. |
| 2 | Práctica: lo usa o trabaja con ello con regularidad. |
| 3 | Experto: es su oficio o tiene experiencia profunda. |

---

## Por qué MCP

| Opción | Cómo obtiene el perfil | Esfuerzo | Veredicto |
|---|---|---|---|
| **Servidor MCP remoto** | Claude llama `submit_profile` desde cualquier app (web, desktop, móvil) | Medio (OAuth es lo difícil) | **Elegida** |
| Prompt para copiar y pegar | El usuario pega un prompt en cualquier asistente y pega la respuesta en nuestra app | Muy bajo | **Respaldo para la demo** y para quien no puede usar conectores |
| Import del export (`conversations.json`) | Un LLM nuestro extrae el perfil del historial completo | Bajo–medio | Complemento: más evidencia, pero procesamos conversaciones en nuestro servidor |
| Extensión que scrapea claude.ai | Lee los chats en el navegador | Medio, con mantenimiento | Frágil, sin móvil, puede chocar con los términos del sitio |
| Proxy de la API | — | Medio | No sirve: las apps de Claude no se pueden apuntar a un proxy |

Por qué gana MCP:
1. **Es el punto de extensión oficial** de claude.ai y funciona en todas las superficies, incluido el móvil.
2. **El perfil lo arma el agente del usuario, no nosotros.** Las conversaciones nunca salen de Claude; solo sale el resumen. Calza con "el agente es la única puerta" del modelo.
3. **Datos estructurados desde el origen.** La herramienta impone el formato, así que no hay parseo de texto libre.
4. **Una llamada, no una por turno.** Sin costo de tokens en cada chat ni turnos perdidos.
5. **Sirve después.** El mismo conector puede exponer herramientas de lectura (p. ej. que el agente consulte sus nodos de pareja) sin una integración nueva.

---

## Cómo funciona

### Flujo
```
1. El usuario agrega el conector en claude.ai e inicia sesión (OAuth → nuestra cuenta).
2. En un chat dice: "arma mi perfil".
3. Claude revisa lo que sabe de la persona, muestra el borrador en el chat y el usuario lo corrige.
4. Claude llama submit_profile → se guarda el nodo personal del usuario (todo privado por defecto).
5. En nuestra app, el usuario marca qué tópicos publica en el índice.
```
Volver a llamar `submit_profile` **reemplaza** el perfil (con versión), no lo acumula.

### Instrucciones del servidor (se envían en `initialize`)
> Cuando el usuario pida armar o actualizar su perfil, usa lo que sabes de él (memoria, chats anteriores, esta conversación) para proponer: entre 5 y 15 tópicos, cada uno con profundidad 1 (interés), 2 (práctica) o 3 (experto) según cuánto **sabe** del tema, no cuánto habla de él; hasta 5 cosas que busca y hasta 5 que ofrece. Usa nombres de tópico cortos, en minúsculas y ni muy amplios ni muy específicos (`open-banking`, no `tecnología` ni `api-de-pagos-de-banco-x`). Si te falta información, pregúntale. No incluyas salud, política, religión, orientación sexual ni otros datos sensibles. Muestra el borrador y pide confirmación antes de llamar a `submit_profile`.

### Herramienta `submit_profile`
```jsonc
// entrada
{
  "topics": [
    { "name": "open-banking", "depth": 3, "reason": "Trabaja en una fintech de pagos" },
    { "name": "fintech",      "depth": 3, "reason": "…" },
    { "name": "running",      "depth": 2, "reason": "Entrena para maratón" }
  ],
  "busca":  ["inversión semilla"],
  "ofrece": ["experiencia en pagos"]
}
// salida
{ "version": 2, "topics": 3, "reviewUrl": "https://<app>/perfil" }
```
- `depth` es entero 1–3. Máximo 15 tópicos, 5 `busca`, 5 `ofrece`.
- `reason` es una línea de evidencia. La ve solo el usuario en la revisión; **nunca** va al índice.
- `userId` sale del access token, **nunca** de los argumentos.

### Archivo resultante (nodo personal)
El formato es el del [modelo-tecnico](modelo-tecnico.md), con frontmatter para versión y visibilidad:
```markdown
---
type: profile
source: claude
version: 2
updated: 2026-11-21T14:20:00Z
public: [open-banking, fintech]   # lo que el usuario marcó; el resto queda privado
---
# ana.md

## Tópicos
- open-banking · 3
- fintech · 3
- running · 2

## Busca
- inversión semilla

## Ofrece
- experiencia en pagos
```
El **índice** que sale hacia el cálculo de gravedad contiene solo los tópicos de `public` con su profundidad y su embedding (calculado una vez al guardar). Ni `reason` ni los tópicos privados salen del nodo personal.

---

## Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| **Claude sabe poco del usuario** si no tiene memoria ni acceso a chats anteriores activados. | Perfil pobre o genérico | Las instrucciones le piden preguntar lo que falta. Import del export como complemento. |
| **Profundidad mal estimada.** Claude puede confundir "habla mucho de X" con "sabe mucho de X" o inflar todo a 3. | La similitud pondera mal | Rúbrica explícita en las instrucciones. Borrador en el chat y revisión en la app, donde se puede editar. |
| **Nombres de tópico inconsistentes** entre usuarios (`fintech` vs `finanzas-tech`). | Calces perdidos | Los embeddings por tópico absorben los casi-iguales (umbral de calce del modelo). Las instrucciones fijan el estilo de nombre. |
| **Datos sensibles** en el perfil. | Confianza y exposición legal | Excluidos en las instrucciones. Todo privado por defecto; publicar es una acción explícita por tópico. |
| **Los conectores de claude.ai exigen OAuth** para auth por usuario. | La mayor parte del esfuerzo | Partir con un token temporal de desarrollo. El prompt para copiar y pegar no necesita OAuth. |
| **Conectores limitados por plan o workspace.** | Hay usuarios que no pueden conectar | Prompt para copiar y pegar como camino alternativo. |
| **El usuario debe aprobar la llamada** a la herramienta. | Fricción menor | Es una sola llamada, y la aprobación muestra exactamente qué se envía. |

---

## Orden de construcción
1. Endpoint `/mcp` + `submit_profile` → nodo personal, con un token temporal de desarrollo (probar con curl y MCP Inspector).
2. Prompt para copiar y pegar que produce el mismo JSON, y una pantalla para pegarlo. Deja la demo cubierta aunque falle lo demás.
3. Revisión en la app: editar tópicos y profundidades, marcar qué se publica.
4. Cuentas, OAuth y consentimiento; quitar el token de desarrollo.
5. Prueba de punta a punta desde claude.ai (Settings → Connectors → Add custom connector → URL de `/mcp`).

## Verificación
- curl a `/mcp`: `initialize`, `tools/list`, `submit_profile` válido y con errores (`depth` fuera de rango, demasiados tópicos). Sin token o con uno inválido: 401 con `WWW-Authenticate: Bearer resource_metadata=…`.
- Llamar dos veces: queda un solo perfil con `version` incrementada.
- claude.ai: con dos o tres cuentas reales del equipo, "arma mi perfil" produce tópicos razonables y profundidades que la persona reconoce como correctas.
- Aislamiento: el token de A no puede leer ni escribir el perfil de B. El índice nunca contiene tópicos privados ni `reason`.

## Preguntas abiertas
- ¿La rúbrica de profundidad 1–3 es la correcta? Validarla con los perfiles del equipo.
- ¿La marca público/privado se hace solo en la app o también en el chat, antes de enviar?
- ¿Cada cuánto se actualiza el perfil? ¿Solo a pedido del usuario o con un recordatorio?
- ~~¿Dónde vive el nodo personal en el hack?~~ En el teléfono; el servidor solo es buzón ([arquitectura-por-capas](arquitectura-por-capas.md)).
