import { z } from "zod";

// Place name for the home screen. The phone sends its position rounded to ~100 m; we ask
// OpenStreetMap's Nominatim for the neighbourhood and city and keep nothing.

const Query = z.object({ lat: z.coerce.number().min(-90).max(90), lon: z.coerce.number().min(-180).max(180) });

type Nominatim = { address?: Record<string, string>; name?: string };

export async function GET(request: Request) {
  const q = Query.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!q.success) return Response.json({ error: "Se esperan lat y lon" }, { status: 400 });
  const lat = q.data.lat.toFixed(3);
  const lon = q.data.lon.toFixed(3);
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=16&accept-language=es&lat=${lat}&lon=${lon}`;
  const response = await fetch(url, { headers: { "User-Agent": "Minga/0.1 (Platanus Hack demo)" } });
  if (!response.ok) return Response.json({ error: "No pudimos ubicar el lugar" }, { status: 502 });
  const { address = {}, name } = (await response.json()) as Nominatim;
  const area = address.neighbourhood ?? address.suburb ?? address.quarter ?? address.city_district ?? name;
  const city = address.city ?? address.town ?? address.village ?? address.municipality;
  const label = [area, city].filter((x, i, all) => x && all.indexOf(x) === i).join(", ");
  return Response.json({ label: label || "Ubicación sin nombre" });
}
