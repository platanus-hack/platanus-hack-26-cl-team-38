# Docs

Copiados del vault de preparación del equipo (`07-hack/`) el 21-11-2026 y alineados entre sí al pasarlos. Desde ahora la versión viva es esta; las decisiones nuevas van en `CLAUDE.md`.

## Qué manda

Cuando dos documentos se contradicen, vale el primero de esta lista:

1. `CLAUDE.md` · Decisiones (con fecha).
2. Lo marcado **Decidido** en [arquitectura-por-capas](arquitectura-por-capas.md).
3. [plan-de-construccion](plan-de-construccion.md) y lo marcado **Propuesta** en la arquitectura (supuestos para construir, por confirmar).
4. [master-idea](master-idea.md) y [solucion-core](solucion-core.md): la visión. Lo que queda fuera del hack está marcado.
5. [modelo-tecnico](modelo-tecnico.md) y [mcp-ingestion](mcp-ingestion.md): diseños anteriores, reemplazados en parte por la arquitectura.
## Índice

| Doc | Qué es |
|---|---|
| [solucion-core](solucion-core.md) | La idea sin detalle técnico: problema, para quién, qué no es |
| [master-idea](master-idea.md) | Documento maestro de la visión (el **qué**) · [animación](master-idea-animacion.html), desactualizada |
| [arquitectura-por-capas](arquitectura-por-capas.md) | Diseño en 6 capas, contratos y algoritmos (el **cómo** del hack) |
| [plan-de-construccion](plan-de-construccion.md) | Orden de construcción: P0–P4 y frentes A–E |
| [modelo-tecnico](modelo-tecnico.md) | Modelo técnico anterior (gravedad, nodos de pareja y grupo) |
| [mcp-ingestion](mcp-ingestion.md) | Conector MCP `submit_profile` (paso A5) |
| [conectores-api](conectores-api.md) | Investigación: conectores de GitHub, Spotify y Strava (acceso, auth, mapeo a señales, términos) |
| [infra-propuestas](infra-propuestas.md) | Propuestas de infra para iterar |
| [onboarding-privacidad](onboarding-privacidad.md) | Propuesta: onboarding, niveles de tópico (segura, personal, sensible) y verificaciones de la capa privada |
| [casos-de-uso](casos-de-uso.md) | Propuesta, no manda sobre lo anterior: conexión 1a1 (match total), sala con propósito y modo explorador |

## Glosario

Los documentos más antiguos usan otros nombres para las mismas cosas.

| En el hack | En master-idea | En modelo-tecnico |
|---|---|---|
| Nodo personal (`PersonalNode`) | Grafo personal | Nodo personal (`.md`) |
| Proyección pública (`PublicProjection`) | Capa pública | Índice |
| Mesa → nodo de grupo (`GroupNode`) | Nodo de relación / nodo de grupo | Nodo de pareja / nodo de grupo |
| Tema (`Theme`) | — | Tópico del grupo |

Los links a notas del vault que no se copiaron (eventos pasados, playbooks, plantillas) quedaron como texto.
