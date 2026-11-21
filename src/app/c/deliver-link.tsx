"use client";

import { useEffect, useRef, useState } from "react";

type State = { title: string; detail: string };

const LOADING: State = { title: "Cargando tu perfil…", detail: "" };

export function DeliverLink() {
  const [state, setState] = useState<State>(LOADING);
  const handled = useRef(false);

  useEffect(() => {
    function deliver() {
      const fragment = window.location.hash;
      if (fragment.length < 2) {
        if (!handled.current) queueMicrotask(() => setState({ title: "Este enlace no trae ningún perfil", detail: "Vuelve a la app y copia un mensaje nuevo." }));
        return;
      }
      handled.current = true;
      // The token must not stay in the address bar or in the history.
      window.history.replaceState(null, "", window.location.pathname);
      queueMicrotask(() => setState(LOADING));
      fetch("/api/onboarding/link", { method: "POST", body: fragment })
        .then((response) =>
          setState(
            response.ok
              ? { title: "Perfil recibido", detail: "Vuelve a la app para revisarlo y decidir qué publicas." }
              : { title: "No se pudo cargar", detail: response.status === 401 ? "El mensaje venció. Vuelve a la app y copia uno nuevo." : "El enlace llegó incompleto. Pídele a tu asistente que lo escriba de nuevo." },
          ),
        )
        .catch(() => setState({ title: "No se pudo cargar", detail: "Revisa tu conexión y toca el enlace de nuevo." }));
    }

    deliver();
    // A second link opened in this same tab only changes the hash: the page does not reload.
    window.addEventListener("hashchange", deliver);
    return () => window.removeEventListener("hashchange", deliver);
  }, []);

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">{state.title}</h1>
      <p role="status" className="text-sm text-muted-foreground">
        {state.detail}
      </p>
    </>
  );
}
