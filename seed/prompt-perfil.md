Usa tu memoria y lo que sabes de mí por nuestras conversaciones anteriores. Quiero un perfil con lo que sé, lo que hago, lo que me gusta y lo que quiero aprender o llegar a ser.

Devuelve SOLO un arreglo JSON, sin texto antes ni después, con entre 15 y 30 objetos de esta forma:

{
  "source": "claude" | "chatgpt" | "gemini",
  "kind": "sabe" | "hace" | "es" | "le_gusta" | "quiere_ser" | "busca" | "ofrece",
  "label": "nombre corto en minúsculas, en español, de 1 a 4 palabras",
  "strength": número entre 0 y 1,
  "evidence": "una frase con lo que te hace pensarlo"
}

En "source" pon el asistente que eres tú: "claude", "chatgpt" o "gemini".

Qué significa cada kind:
- sabe: un conocimiento que domino ("ruby on rails", "kubernetes").
- hace: algo que practico de verdad, con frecuencia ("guitarra eléctrica", "trekking").
- es: un oficio o identidad profesional ("fintech", "diseñadora industrial").
- le_gusta: un gusto o interés sin práctica seria ("jazz", "vinos naturales").
- quiere_ser: algo que quiero llegar a ser o hacer ("fundar una startup").
- busca: algo concreto que quiero aprender o conseguir ahora ("aprender a escalar").
- ofrece: algo con lo que puedo ayudar a otros ("mentorías de backend").

Reglas:
- strength: 0,9 o más solo si hay evidencia clara y repetida; entre 0,5 y 0,8 si aparece varias veces; menos de 0,5 si es una inferencia débil.
- Labels específicos, no genéricos: "fotografía de naturaleza" y no "fotografía"; "machine learning" y no "tecnología". Sin nombres de empresas, personas ni lugares privados.
- Si dos señales son casi lo mismo ("guitarra" y "guitarra eléctrica"), deja solo una.
- No incluyas preguntas puntuales de soporte técnico ("arreglar el wifi") ni nada sensible: salud, política, religión, orientación sexual, finanzas personales ni datos de contacto.
- Incluye al menos 3 señales de quiere_ser o busca, y al menos 4 de le_gusta o hace que no sean de trabajo.
- Si no sabes algo, no lo inventes: menos señales es mejor que señales falsas.
