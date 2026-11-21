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
    tagline: "Coordinación entre personas potenciadas por Agentes",
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
    pasteHint: "Pégalo en tu asistente y trae su respuesta.",
    read: "Leer respuesta",
  },

  desktop: {
    building: "Armando tu Nodo",
  },
} as const;

/** Domain words that always go capitalized, for the copy check. */
export const CONCEPTS = ["Minga", "Nodo", "Agente", "Coincidencia", "Conversación", "Interés", "Intereses", "Perfil", "Fuente", "Ubicación", "Distancia"];
