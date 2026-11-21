import type { Metadata } from "next";
import { Suspense } from "react";
import { OnboardingFlow } from "./client-only";

export const metadata: Metadata = { title: "Arma tu nodo · team-38" };

export default function OnboardingPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Arma tu nodo</h1>
        <p className="text-sm text-muted-foreground">
          Claude y ChatGPT ya te conocen. Trae lo que saben de ti, elige qué ve la sala y qué queda privado, y entra.
        </p>
      </header>
      <Suspense>
        <OnboardingFlow />
      </Suspense>
    </main>
  );
}
