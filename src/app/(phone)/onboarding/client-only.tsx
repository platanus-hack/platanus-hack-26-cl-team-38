"use client";

import dynamic from "next/dynamic";

// The flow reads its state from localStorage on first render; rendering it on the server would only
// produce a mismatch.
export const OnboardingFlow = dynamic(() => import("./onboarding-flow").then((m) => m.OnboardingFlow), {
  ssr: false,
  loading: () => <p className="text-sm text-muted-foreground">Cargando…</p>,
});
