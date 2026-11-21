import Link from "next/link";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { HealthCheck } from "./health-check";

async function Rooms() {
  const { data, error } = await supabaseAdmin
    .from("rooms")
    .select("id, code, name, room_members(count)")
    .order("id");
  if (error) return <p className="text-sm text-destructive">No se pudo leer Supabase: {error.message}</p>;
  if (data.length === 0) return <p className="text-sm text-muted-foreground">No hay salas. Corre `pnpm seed`.</p>;

  return (
    <div className="grid gap-3">
      {data.map((room) => (
        <Card key={room.id} size="sm">
          <CardHeader>
            <CardTitle>{room.name}</CardTitle>
            <CardDescription className="flex gap-2">
              <Badge variant="secondary">{room.code}</Badge>
              <span>{room.room_members[0]?.count ?? 0} personas</span>
            </CardDescription>
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">team-38</h1>
        <p className="text-sm text-muted-foreground">Base del repo (P0 + P1). Las pantallas del frente E reemplazan esta página.</p>
      </header>
      <HealthCheck />
      <Link href="/explorar" className="text-sm font-medium underline underline-offset-4">
        Ver cómo se arma una sala
      </Link>
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">Salas</h2>
        <Suspense fallback={<p className="text-sm text-muted-foreground">Cargando salas…</p>}>
          <Rooms />
        </Suspense>
      </section>
    </main>
  );
}
