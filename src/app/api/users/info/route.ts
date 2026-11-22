import { supabaseAdmin } from "@/lib/supabase/admin";
import { readOwnInfo, saveOwnInfo } from "@/lib/users/info";

// Perfil → Información. Both need `Authorization: Bearer <device key>`: a person reads and writes
// only their own.

// GET /api/users/info?personId=… → { info: UserInfo | null }
export async function GET(request: Request) {
  const { status, ...reply } = await readOwnInfo(supabaseAdmin, new URL(request.url).searchParams.get("personId"), request.headers.get("authorization"));
  return Response.json(reply, { status });
}

// POST /api/users/info { personId, displayName?, info } → { info: UserInfo }
export async function POST(request: Request) {
  const { status, ...reply } = await saveOwnInfo(supabaseAdmin, await request.json().catch(() => null), request.headers.get("authorization"));
  return Response.json(reply, { status });
}
