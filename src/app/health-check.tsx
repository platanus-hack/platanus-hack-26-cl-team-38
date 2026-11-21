"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function HealthCheck() {
  const [result, setResult] = useState<string>();

  async function check() {
    setResult("Probando…");
    const response = await fetch("/api/health", { method: "POST" });
    const body = await response.json();
    setResult(body.ok ? "Supabase lee y escribe ✓" : `Falló en ${body.step}: ${body.error}`);
  }

  return (
    <div className="flex items-center gap-3">
      <Button onClick={check} variant="outline">
        Probar Supabase
      </Button>
      {result && <span className="text-sm text-muted-foreground">{result}</span>}
    </div>
  );
}
