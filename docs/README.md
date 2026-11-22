# Docs

Copiados del vault de preparación del equipo (`07-hack/`) el 21-11-2026 y alineados entre sí al pasarlos. Desde ahora la versión viva es esta; las decisiones nuevas van en [decisiones](decisiones.md).

## Qué manda

Cuando dos documentos se contradicen, vale el primero de esta lista:

1. [decisiones](decisiones.md) (con fecha).
2. Lo marcado **Decidido** en [arquitectura-por-capas](arquitectura-por-capas.md).
3. [plan-de-construccion](plan-de-construccion.md) y lo marcado **Propuesta** en la arquitectura (supuestos para construir, por confirmar).
4. [master-idea](master-idea.md) y [solucion-core](solucion-core.md): la visión. Lo que queda fuera del hack está marcado.
5. [modelo-tecnico](archivo/modelo-tecnico.md) y [mcp-ingestion](archivo/mcp-ingestion.md): diseños anteriores, reemplazados en parte por la arquitectura.
## Índice

| Doc | Qué es |
|---|---|
| [decisiones](decisiones.md) | Registro de decisiones del hack, con fecha y tema (antes en `CLAUDE.md`) |
| [solucion-core](solucion-core.md) | La idea sin detalle técnico: problema, para quién, qué no es |
| [master-idea](master-idea.md) | Documento maestro de la visión (el **qué**) |
| [arquitectura-por-capas](arquitectura-por-capas.md) | Diseño en 6 capas, contratos y algoritmos (el **cómo** del hack) |
| [plan-de-construccion](plan-de-construccion.md) | Orden de construcción: P0–P4 y frentes A–E |
| [conectores-api](conectores-api.md) | Investigación: conectores de GitHub, Spotify y Strava (acceso, auth, mapeo a señales, términos) |
| [infra-propuestas](infra-propuestas.md) | Propuestas de infra para iterar |
| [onboarding-privacidad](onboarding-privacidad.md) | Niveles de tópico (segura, personal, sensible) y verificaciones de la capa privada: el filtro ya está construido, el onboarding sigue como propuesta |
| [revision-filtro-privacidad](revision-filtro-privacidad.md) | Guía para revisar el filtro de privacidad: flujo, orden de lectura, cómo verificarlo y decisiones a cuestionar |
| [casos-de-uso](casos-de-uso.md) | Propuesta, no manda sobre lo anterior: conexión 1a1 (match total), sala con propósito y modo explorador |
| [casos-de-uso-potenciales](casos-de-uso-potenciales.md) | Exploración, no manda sobre nada: 120 casos potenciales en 15 tipos de problema, con las capacidades que usa cada uno |
| [modelo-de-datos](modelo-de-datos.md) | Diagrama de Usuario, Conexión, Mesa y Log sobre las tablas que existen: Usuario y Conexión implementados en la rama, Mesa y Log como propuesta |
| [red-de-casos](red-de-casos.html) | Generado con `pnpm seed:graphs`: un grafo por caso de `seed/network.v2.json`. No se edita a mano |

## Archivo

Diseños y planes reemplazados o ya ejecutados. Se guardan para entender por qué se decidió algo; no mandan sobre lo vigente.

| Doc | Qué es |
|---|---|
| [modelo-tecnico](archivo/modelo-tecnico.md) | Modelo técnico anterior (gravedad, nodos de pareja y grupo) |
| [mcp-ingestion](archivo/mcp-ingestion.md) | Conector MCP `submit_profile` (paso A5), reemplazado por el conector MCP con OAuth (ver Contratos en `CLAUDE.md`) |
| [master-idea-animacion](archivo/master-idea-animacion.html) | Animación de [master-idea](master-idea.md), desactualizada |
| [plan-seed-red-v2](archivo/plan-seed-red-v2.md) | Plan para llevar la red del seed al modelo de datos; ejecutado el 22-11 (`seed/network.v2.json`) |
| [frentes](archivo/frentes.md) | Reparto inicial del trabajo en frentes A–E y los tests del motor de sala |

## Glosario

Los documentos más antiguos usan otros nombres para las mismas cosas.

| En el hack | En master-idea | En modelo-tecnico |
|---|---|---|
| Nodo personal (`PersonalNode`) | Grafo personal | Nodo personal (`.md`) |
| Proyección pública (`PublicProjection`) | Capa pública | Índice |
| Mesa → nodo de grupo (`GroupNode`) | Nodo de relación / nodo de grupo | Nodo de pareja / nodo de grupo |
| Tema (`Theme`) | — | Tópico del grupo |

Los links a notas del vault que no se copiaron (eventos pasados, playbooks, plantillas) quedaron como texto.
