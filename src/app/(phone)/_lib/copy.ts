// Every visible text of the phone, in one place, so it stays short.
// Rules: titles of three words or fewer; no explanatory subtitles (explain once, behind a "?");
// domain concepts capitalized: Minga, Nodo, Agente, Coincidencia, Conversación, Interés, Perfil,
// Fuente, Ubicación, Distancia. Everything else in normal sentence case.

export const COPY = {
  app: "Minga",
  description: "Tu Agente te presenta a quienes coinciden contigo cerca tuyo.",

  tabs: { inicio: "Inicio", coincidencias: "Coincidencias", conversaciones: "Conversaciones", perfil: "Perfil" },

  inicio: {
    titles: ["¿Qué quieres lograr?", "Apóyate en tu gente"],
    placeholder: "Resuelve y coordina con tu red de contactos",
    intentHelp: "Solo la ve tu Agente. La usa para elegir con quién conectarte.",
    saved: "Tu Agente lo sabe",
    tagline: "Conexión y coordinación entre personas potenciadas por Agentes",
    coincidence: "Coincidencia",
    locationOff: "Activar Ubicación",
    locating: "Buscando…",
    locationDenied: "Ubicación bloqueada en el navegador",
    near: "Cerca",
    seeAll: "Ver todo",
    nearEmpty: "Nadie cerca todavía.",
    affinities: "Afinidades",
    affinitiesSub: "Tus contactos y lo que tienen en común",
  },

  afinidades: {
    title: "Afinidades",
    desc: "Tus contactos por cercanía: Amigos al centro, luego Conocidos y quienes estuvieron cerca.",
    common: "En común",
    nothing: "Sin Intereses en común todavía.",
    rest: "También",
  },

  coincidencias: {
    title: "Coincidencias",
    desc: "Personas con las que has coincidido según lo que te interesa o estás buscando.",
    loading: "Buscando…",
    empty: "Sin Coincidencias a esta Distancia.",
    closer: "Menos Distancia",
    farther: "Más Distancia",
    met: "Se cruzaron",
    common: "En común",
    rest: "También",
    conversation: "Ver Conversación",
    demo: "Coincidencias de ejemplo",
  },

  conversaciones: {
    title: "Conversaciones",
    groups: "Grupos",
    people: "Personas",
    you: "Tu Agente",
    empty: "Todavía no hay Conversaciones.",
    noBackend: "Sin registro todavía.",
    notFound: "No encontramos esta Conversación.",
  },

  perfil: {
    interests: "Intereses",
    sources: "Fuentes",
    myNode: "Mi Nodo",
    location: "Ubicación",
    outbox: "Qué salió de tu teléfono",
    account: "Cuenta",
    privacy: "Privacidad",
    visibility: "Quién puede verte",
    visibilityOptions: { todos: "Todos", conocidos: "Conocidos", amigos: "Amigos" },
    discoverable: "Aparecer en Coincidencias",
    showPlace: "Mostrar el lugar donde coincidimos",
    wipe: "Borrar mi Nodo",
    wipeConfirm: "¿Borrar tu Nodo de este teléfono? No se puede deshacer.",
    on: "activada",
    off: "apagada",
    none: "Nada todavía.",
    noInterests: "Sin Intereses públicos.",
  },

  nodo: {
    title: "Mi Nodo",
    shared: "públicos",
    kept: "contigo",
    sensitive: "Nunca se comparte",
    addSource: "Agregar Fuente",
  },

  bienvenida: {
    name: "¿Cómo te llamas?",
    namePlaceholder: "Tu nombre o un apodo",
    team: "O entra como",
    sources: "Conecta tus Fuentes",
    building: "Armando tu Nodo",
    share: "¿Qué compartes?",
    shareAll: "Compartir lo recomendado",
    shareHelp: "Lo público es lo que te interesa conectar. Lo demás se queda en tu teléfono.",
    example: "Probar con un ejemplo",
    soon: "pronto",
    next: "Seguir",
    done: "Listo",
    pasteTitle: "Conectar",
    copy: "Copiar mensaje",
    copied: "Copiado",
    pasteHint: "Pégalo en tu asistente. Te responde con un enlace: tócalo y vuelve aquí.",
    pasteFallback: "¿Te respondió con texto? Pégalo aquí.",
    seeMessage: "Ver el mensaje",
    read: "Leer respuesta",
    reading: "Revisando…",
    unreadable: "No pude leer ese texto. Copia el bloque completo, desde [ hasta ].",
    arrived: (n: number) => `Llegaron ${n} ${n === 1 ? "Interés" : "Intereses"}.`,
    held: (n: number) => `Dejé fuera ${n} por ser ${n === 1 ? "un dato sensible" : "datos sensibles"}.`,
    filterDown: "No pudimos revisar la privacidad ahora, así que no cargué nada. Intenta de nuevo.",
    retry: "Intentar de nuevo",
    entering: "Entrando…",
    rejected: (n: number) => `El servidor dejó ${n === 1 ? "un Interés" : `${n} Intereses`} en privado.`,
    personal: "Ojo: podría decir de más sobre ti",
    toHome: "Seguir",
  },

  conectar: {
    title: "Conectar asistente",
    row: "Conectar asistente",
    fromSheet: "¿Agregaste Minga como conector? Conéctalo aquí",
    hint: "Escribe este código en la página donde tu asistente te pidió conectar Minga.",
    loading: "Pidiendo código…",
    failed: "No pudimos pedir el código. Revisa tu conexión.",
    again: "Otro código",
    expires: (min: number) => `Vence en ${min} min`,
    then: "Después pídele a tu asistente: “Sube mi perfil a Minga”. Llega a tu teléfono como borrador y tú decides qué compartes.",
    setupTitle: "¿Cómo lo agrego?",
    setup: (url: string) => `En claude.ai, desde el computador: Configuración → Conectores → Agregar conector personalizado, con el nombre Minga y la dirección ${url}. Al conectarlo te pide este código.`,
  },

  sala: {
    noNode: "Primero arma tu Nodo.",
    noName: "Falta tu nombre.",
    badName: "Tu nombre no puede llevar un correo, teléfono ni RUT.",
    failed: "No pudimos entrarte",
    retry: "Intenta de nuevo.",
  },

  desktop: {
    building: "Armando tu Nodo",
  },
} as const;

/** Domain words that always go capitalized, for the copy check. */
export const CONCEPTS = ["Minga", "Nodo", "Agente", "Coincidencia", "Conversación", "Interés", "Intereses", "Perfil", "Fuente", "Ubicación", "Distancia"];
