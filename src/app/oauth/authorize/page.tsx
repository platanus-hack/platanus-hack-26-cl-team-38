import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthorizeForm } from "./authorize-form";

export const metadata: Metadata = { title: "Conectar tu asistente · Minga" };

// Opened by the assistant (claude.ai) in the person's browser, usually on a computer. The phone is
// who they are, so the page asks for the code the phone shows.
export default function AuthorizePage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 p-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Conecta tu asistente con Minga</h1>
        <p className="text-sm text-muted-foreground">
          Así tu asistente puede dejar tu perfil en tu teléfono cuando se lo pidas. Solo puede escribir ahí, como
          borrador privado: no lee nada de Minga y nada se publica sin que lo decidas tú.
        </p>
      </header>
      <Suspense>
        <AuthorizeForm />
      </Suspense>
    </main>
  );
}
