import { supabaseAdmin } from "@/lib/supabase/admin";

export async function POST() {
  const id = `health-${crypto.randomUUID()}`;
  const write = await supabaseAdmin.from("rooms").insert({ id, code: id, name: "health check" });
  if (write.error) return Response.json({ ok: false, step: "write", error: write.error.message }, { status: 500 });

  const read = await supabaseAdmin.from("rooms").select("id").eq("id", id).single();
  await supabaseAdmin.from("rooms").delete().eq("id", id);
  if (read.error) return Response.json({ ok: false, step: "read", error: read.error.message }, { status: 500 });

  return Response.json({ ok: true });
}
