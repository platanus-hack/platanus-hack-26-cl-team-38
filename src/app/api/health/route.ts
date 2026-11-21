import { connection } from "next/server";
import { isWarmingUp, warmPrivacyFilter } from "@/lib/privacy/warm";
import { supabaseAdmin } from "@/lib/supabase/admin";

// For the platform's health check (render.yaml). The first call starts loading the model the
// privacy filter needs; until it is in memory this answers 503, so a fresh instance gets no
// traffic while its first request would still take a minute. It never waits for the load itself.
export async function GET() {
  await connection();
  const warmth = warmPrivacyFilter();
  const warming = isWarmingUp(warmth);
  return Response.json({ ok: !warming, privacyFilter: warmth.state }, { status: warming ? 503 : 200 });
}

export async function POST() {
  const id = `health-${crypto.randomUUID()}`;
  const write = await supabaseAdmin.from("rooms").insert({ id, code: id, name: "health check" });
  if (write.error) return Response.json({ ok: false, step: "write", error: write.error.message }, { status: 500 });

  const read = await supabaseAdmin.from("rooms").select("id").eq("id", id).single();
  await supabaseAdmin.from("rooms").delete().eq("id", id);
  if (read.error) return Response.json({ ok: false, step: "read", error: read.error.message }, { status: 500 });

  return Response.json({ ok: true });
}
