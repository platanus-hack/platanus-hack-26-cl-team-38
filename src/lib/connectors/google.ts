import { inflateRawSync } from "node:zlib";
import type { SynthesisSignal } from "@/lib/types";
import { admitSignals, type ClassifySignals } from "./assistant";
import type { InboxStore } from "./inbox";

// Google connector: the person asks Google Takeout for an export delivered to their Drive, then
// picks that ZIP in Google's own file picker. With `drive.file` (a non-sensitive scope) we can
// download that one file and nothing else in their Drive. From the ZIP we read YouTube (channels
// they follow and the ones they watch most) and Calendar (titles of events that repeat). Not read:
// searches, video titles, attendees, descriptions, locations. The ZIP and Google's token only pass
// through memory; what is kept are the signals the privacy filter lets through.

export const DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const MAX_ZIP_BYTES = 300 * 2 ** 20;
const FLOW_MINUTES = 15;

export type GoogleConfig = { clientId: string; clientSecret: string };

export function googleConfig(env: Record<string, string | undefined> = process.env): GoogleConfig | null {
  const { GOOGLE_CLIENT_ID: clientId, GOOGLE_CLIENT_SECRET: clientSecret } = env;
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export const googleAuthUrl = (clientId: string, redirectUri: string, state: string) =>
  `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, state, response_type: "code", scope: DRIVE_FILE_SCOPE })}`;

// null: Google refused the code, or the person left the Drive permission unticked on Google's screen.
export async function exchangeGoogleCode(
  config: GoogleConfig,
  code: string,
  redirectUri: string,
  fetcher: typeof fetch = fetch,
): Promise<string | null> {
  const response = await fetcher("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const body = (await response.json().catch(() => null)) as { access_token?: unknown; scope?: unknown } | null;
  if (!response.ok || typeof body?.access_token !== "string") return null;
  return String(body.scope).split(" ").includes(DRIVE_FILE_SCOPE) ? body.access_token : null;
}

// shortcut: the whole ZIP goes through memory (300 MB cap), stream it to disk in parts if real exports are larger.
export async function downloadDriveFile(
  accessToken: string,
  fileId: string,
  fetcher: typeof fetch = fetch,
): Promise<Buffer | null> {
  const response = await fetcher(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok || Number(response.headers.get("content-length") ?? 0) > MAX_ZIP_BYTES) return null;
  const bytes = Buffer.from(await response.arrayBuffer());
  return bytes.length > MAX_ZIP_BYTES ? null : bytes;
}

// The steps between the phone, Google and the picker, each id good for one use: first the `state`
// that Google sends back, then the pick id that holds Google's token while the person chooses.
// shortcut: one process, in memory, like the inbox. With more than one instance this moves to a shared store.
export function createGoogleFlow(ttlMs = FLOW_MINUTES * 60_000) {
  const steps = new Map<string, { owner: string; accessToken?: string; expiresAt: number }>();
  return {
    put(owner: string, accessToken?: string, now = Date.now()): string {
      for (const [id, step] of steps) if (now > step.expiresAt) steps.delete(id);
      const id = crypto.randomUUID();
      steps.set(id, { owner, accessToken, expiresAt: now + ttlMs });
      return id;
    },
    take(id: string | null | undefined, now = Date.now()): { owner: string; accessToken?: string } | null {
      const step = id ? steps.get(id) : undefined;
      if (id) steps.delete(id);
      return step && now <= step.expiresAt ? step : null;
    },
  };
}

export type GoogleFlow = ReturnType<typeof createGoogleFlow>;

type ZipEntry = { name: string; read: () => Buffer };

// Just enough of the ZIP format to read a Takeout export from memory, from its central directory.
// shortcut: no ZIP64 (files or archives over 4 GB); the download is capped far below that.
export function unzip(zip: Buffer): ZipEntry[] {
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (end < 0) throw new Error("not a zip");
  const entries: ZipEntry[] = [];
  let at = zip.readUInt32LE(end + 16);
  for (let i = zip.readUInt16LE(end + 10); i > 0 && zip.readUInt32LE(at) === 0x02014b50; i--) {
    const method = zip.readUInt16LE(at + 10);
    const size = zip.readUInt32LE(at + 20);
    const nameLength = zip.readUInt16LE(at + 28);
    const local = zip.readUInt32LE(at + 42);
    entries.push({
      name: zip.toString("utf8", at + 46, at + 46 + nameLength),
      read() {
        const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
        const raw = zip.subarray(start, start + size);
        return method === 0 ? raw : inflateRawSync(raw);
      },
    });
    at += 46 + nameLength + zip.readUInt16LE(at + 30) + zip.readUInt16LE(at + 32);
  }
  return entries;
}

const unescapeHtml = (text: string) =>
  text
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"');

// Most frequent first; ties by name, so the same export always gives the same signals.
function tally(values: string[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

// Pure and deterministic. Takeout translates folder and file names to the account's language, so
// each piece is recognized by its shape, not by its path. Everything is a passive taste
// (`le_gusta`): the synthesizer never takes it past depth 2. At most 40 signals.
// shortcut: labels are channel names and event titles as written, not topics from a dictionary
// (docs/conectores-api.md, "Reglas comunes"); map them to topics before trusting them in a room.
export function takeoutSignals(zip: Buffer): SynthesisSignal[] {
  const subscribed: string[] = [];
  const watched: string[] = [];
  const events: string[] = [];
  for (const entry of unzip(zip)) {
    if (!/\.(csv|json|html|ics)$/i.test(entry.name)) continue;
    const text = entry.read().toString("utf8");
    if (/\.csv$/i.test(entry.name)) {
      // subscriptions.csv: channel id, channel url, channel title (quoted when it has a comma).
      for (const row of text.matchAll(/^[^,\n]*,https?:\/\/www\.youtube\.com\/channel\/[^,\n]*,(.+)$/gm)) {
        subscribed.push(
          row[1]
            .trim()
            .replace(/^"(.*)"$/, "$1")
            .replaceAll('""', '"'),
        );
      }
    } else if (/\.ics$/i.test(entry.name)) {
      // iCalendar folds long lines: the continuation starts with a space.
      for (const event of text
        .replace(/\r?\n[ \t]/g, "")
        .split("BEGIN:VEVENT")
        .slice(1)) {
        const title = event
          .match(/^SUMMARY[^:\r\n]*:(.*)$/m)?.[1]
          .replace(/\\([,;\\])/g, "$1")
          .replace(/\\n/gi, " ")
          .trim()
          .toLowerCase();
        // A recurring event counts as repeated on its own; a one-off needs to show up three times.
        if (title) events.push(...Array<string>(/^RRULE/m.test(event) ? 3 : 1).fill(title));
      }
    } else {
      // Watch history, as HTML (Takeout's default) or JSON: the channel is the link to /channel/.
      for (const m of text.matchAll(/href="https:\/\/www\.youtube\.com\/channel\/[^"]*">([^<]+)<\/a>/g))
        watched.push(unescapeHtml(m[1]));
      for (const m of text.matchAll(
        /"name":\s*"((?:[^"\\]|\\.)*)",\s*"url":\s*"https:\/\/www\.youtube\.com\/channel\//g,
      ))
        watched.push(JSON.parse(`"${m[1]}"`) as string);
    }
  }

  // One video says nothing about a person; three or more of the same channel does.
  const most = tally(watched)
    .filter(([, count]) => count >= 3)
    .slice(0, 15);
  const repeated = tally(events)
    .filter(([, count]) => count >= 3)
    .slice(0, 10);
  const byLabel = new Map<string, SynthesisSignal>();
  const add = (label: string, strength: number) => {
    const name = label.trim().slice(0, 60).trim();
    const key = name.toLowerCase();
    if (name && (byLabel.get(key)?.strength ?? -1) < strength)
      byLabel.set(key, { source: "google", kind: "le_gusta", label: name, strength: Math.round(strength * 100) / 100 });
  };
  for (const [channel, count] of most) add(channel, count / most[0][1]);
  for (const [title] of repeated) add(title, 0.4);
  for (const channel of [...new Set(subscribed)].slice(0, 15)) add(channel, 0.3);
  return [...byLabel.values()];
}

type Deps = { inbox: Pick<InboxStore, "openFor" | "deliver">; classify: ClassifySignals };

// Same door as the other connectors: the privacy filter on the way in, then the inbox of the phone
// that started the flow, which collects it as a private draft (see ConnectorInbox).
export async function receiveTakeout(
  owner: string,
  zip: Buffer,
  deps: Deps,
): Promise<{ accepted: number; held: number }> {
  const signals = takeoutSignals(zip);
  if (signals.length === 0) return { accepted: 0, held: 0 };
  const { accepted, held } = await admitSignals(signals, deps.classify);
  deps.inbox.deliver(deps.inbox.openFor(owner).token, accepted);
  return { accepted: accepted.length, held };
}

const page = (
  body: string,
) => `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Minga · Google</title><body style="font: 17px/1.5 system-ui, sans-serif; max-width: 26rem; margin: 3rem auto; padding: 0 1.25rem">${body}`;

export const googleMessagePage = (message: string) =>
  page(`<p>${message}</p><p><a href="/bienvenida">Volver a Minga</a></p>`);

// Google's file picker, outside the app's shell so it is plain HTML with one script. `setAppId`
// (the Cloud project number, the first part of the client id) is what lets `drive.file` download
// the file the person picks.
export function googlePickerPage({
  accessToken,
  clientId,
  pick,
}: {
  accessToken: string;
  clientId: string;
  pick: string;
}): string {
  const data = JSON.stringify({ accessToken, appId: clientId.split("-")[0], pick }).replaceAll("<", "\\u003c");
  return page(`<h1 style="font-size: 1.4rem">Elige tu exportación</h1>
<p id="status">Está en la carpeta “Takeout” de tu Drive y su nombre empieza con “takeout-”.</p>
<p><a href="/bienvenida">Volver a Minga</a></p>
<script src="https://apis.google.com/js/api.js"></script>
<script>
const data = ${data};
const say = (text) => { document.getElementById("status").textContent = text; };
gapi.load("picker", () => {
  new google.picker.PickerBuilder()
    .addView(new google.picker.DocsView().setMimeTypes("application/zip,application/x-zip-compressed").setQuery("takeout").setMode(google.picker.DocsViewMode.LIST))
    .setLocale("es").setOAuthToken(data.accessToken).setAppId(data.appId)
    .setCallback(async (picked) => {
      if (picked.action !== "picked") return;
      say("Leyendo tu exportación. Tarda unos segundos…");
      const response = await fetch("/api/google/takeout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pick: data.pick, fileId: picked.docs[0].id }) }).catch(() => null);
      const body = response ? await response.json().catch(() => null) : null;
      say(body && body.message ? body.message : "No pudimos leer ese archivo. Vuelve a Minga e intenta de nuevo.");
    })
    .build().setVisible(true);
});
</script>`);
}
