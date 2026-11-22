# Seed

| Archivo | Qué es |
|---|---|
| `people.ts` | Las salas y las personas sintéticas, escritas a mano |
| `team/<slug>.json` | Los integrantes del equipo, con tópicos sacados de sus asistentes |
| `network.v2.json` | 53 personas sintéticas para tres casos de coordinación (matrimonio, viaje familiar, arriendo con roomies), ordenadas según dónde va cada dato en el modelo (ver `network.ts`). `network.v1.json` es el original escrito a mano: no se edita, y `network.test.ts` comprueba que la v2 lo reconstruye. `pnpm seed:graphs` dibuja un grafo por caso en `docs/red-de-casos.html` |
| `rooms.json` | Lo que se carga en Supabase: lo anterior con embeddings (`pnpm seed:build`) |

## Agregar tu perfil

1. Pega [`prompt-perfil.md`](prompt-perfil.md) en Claude (claude.ai con memoria, o Claude Code, que conoce tus proyectos) y en ChatGPT. Guarda cada respuesta en un archivo **fuera del repo**, porque trae `evidence` y esa evidencia es privada:

   ```bash
   pbpaste > /tmp/claude.json     # después de copiar la respuesta de Claude
   pbpaste > /tmp/chatgpt.json    # lo mismo con la de ChatGPT
   ```

2. Genera tu persona:

   ```bash
   pnpm seed:person cristobal "Cristóbal" /tmp/claude.json /tmp/chatgpt.json
   ```

   El script junta las señales con el mismo nombre, calcula la profundidad con los topes del sintetizador y escribe `seed/team/cristobal.json` sin la evidencia. Además lista con qué tópicos de la sala se va a enlazar cada uno.

   Antes de escribir, cada tópico pasa por el filtro de privacidad (`src/lib/privacy/`): solo entran los que quedan como seguros, y el script lista los que dejó fuera con el motivo. Necesita `ANTHROPIC_API_KEY` en `.env.local`; con `--sin-juez` usa solo el léxico y las anclas, y en ese caso revisa el JSON con más cuidado.

3. Revisa esa lista. Si un par no tiene relación (en el seed de Oscar, "nuxt" quedaba pegado a escalada y fintech), cambia el nombre del tópico en el JSON por uno más específico. También puedes juntar a mano tópicos casi iguales o borrar los que no quieras publicar.

4. Carga y sube:

   ```bash
   pnpm seed:build && pnpm seed
   git add seed/team seed/rooms.json
   ```

Cada integrante entra a la sala **Platanus Hack 26** (HACK26). Con `--mut` entra también a la sala MUT, pero esa sala acepta hasta 20 personas.
