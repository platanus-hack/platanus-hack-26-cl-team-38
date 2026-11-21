# Seed

| Archivo | Qué es |
|---|---|
| `people.ts` | Las salas y las personas sintéticas, escritas a mano |
| `team/<slug>.json` | Los integrantes del equipo, con tópicos sacados de sus asistentes |
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

3. Revisa esa lista. Si un par no tiene relación (en el seed de Oscar, "nuxt" quedaba pegado a escalada y fintech), cambia el nombre del tópico en el JSON por uno más específico. También puedes juntar a mano tópicos casi iguales o borrar los que no quieras publicar.

4. Carga y sube:

   ```bash
   pnpm seed:build && pnpm seed
   git add seed/team seed/rooms.json
   ```

Cada integrante entra a la sala **Platanus Hack 26** (HACK26). Con `--mut` entra también a la sala MUT, pero esa sala acepta hasta 20 personas.
