import type { Metadata } from "next";
import { ConnectAssistant } from "./connect-assistant";

export const metadata: Metadata = { title: "Arma tu perfil · team-38" };

export default function OnboardingPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Arma tu perfil con tu asistente</h1>
        <p className="text-sm text-muted-foreground">
          Tu asistente ya te conoce. Copia un mensaje, pégalo en Claude, ChatGPT o Gemini, y tus temas llegan aquí como borrador.
        </p>
      </header>
      <ConnectAssistant />
    </main>
  );
}
