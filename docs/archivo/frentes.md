# Frentes del hack

*Histórico.* El reparto inicial de trabajo del 21-11, cuando la idea era una sala con mesas y un proyector. Estaba en `CLAUDE.md`. Lo que se construyó y lo que no está en la introducción de `CLAUDE.md` y en [decisiones](../decisiones.md); los tests del motor de sala siguen vigentes en `src/lib/room/engine.test.ts`.

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
