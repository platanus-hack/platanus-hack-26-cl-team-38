import { deflateRawSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";
import { createGoogleFlow, downloadDriveFile, DRIVE_FILE_SCOPE, exchangeGoogleCode, googleAuthUrl, googlePickerPage, receiveTakeout, takeoutSignals, unzip } from "./google";
import { createInboxStore } from "./inbox";

// A ZIP built by hand, deflated like Takeout's, so the test needs no `zip` binary.
function zipOf(files: Record<string, string>): Buffer {
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const nameBytes = Buffer.from(name);
    const data = deflateRawSync(Buffer.from(text));
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt16LE(nameBytes.length, 26);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(8, 10);
    entry.writeUInt32LE(data.length, 20);
    entry.writeUInt16LE(nameBytes.length, 28);
    entry.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, data);
    central.push(entry, nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(Buffer.concat(central).length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...central, end]);
}

const watchedHtml = (channel: string, times: number) => `<a href="https://www.youtube.com/watch?v=x">un video</a><br><a href="https://www.youtube.com/channel/UC1">${channel}</a><br>`.repeat(times);
const event = (title: string, extra = "") => `BEGIN:VEVENT\r\nSUMMARY:${title}\r\n${extra}END:VEVENT\r\n`;

// An invented export, with the names Takeout uses for an account in Spanish.
const TAKEOUT = zipOf({
  "Takeout/YouTube y YouTube Music/suscripciones/suscripciones.csv":
    'ID del canal,URL del canal,Título del canal\nUC1,http://www.youtube.com/channel/UC1,Torno & Barro\nUC2,http://www.youtube.com/channel/UC2,"Running, sin apuro"\n',
  "Takeout/YouTube y YouTube Music/historial/historial-de-reproducciones.html": watchedHtml("Torno &amp; Barro", 4) + watchedHtml("Finanzas Abiertas", 2) + watchedHtml("Visto una vez", 1),
  "Takeout/YouTube y YouTube Music/historial/historial-de-búsquedas.html": '<a href="https://www.youtube.com/results?search_query=x">ansiedad nocturna</a>',
  "Takeout/Calendar/ana@example.com.ics":
    "BEGIN:VCALENDAR\r\n" +
    event("Clase de cerámica\\, torno", "RRULE:FREQ=WEEKLY\r\nATTENDEE:mailto:otra.persona@example.com\r\nDESCRIPTION:Traer delantal\r\n") +
    event("Almuerzo con Pedro") +
    event("Trote largo con el club\r\n  de running").repeat(3) +
    "END:VCALENDAR\r\n",
  "Takeout/Calendar/foto.png": "no se lee",
});

describe("takeoutSignals", () => {
  it("reads channels followed, channels watched three times or more and events that repeat, and nothing else", () => {
    const signals = takeoutSignals(TAKEOUT);
    expect(signals).toEqual([
      { source: "google", kind: "le_gusta", label: "Torno & Barro", strength: 1 },
      { source: "google", kind: "le_gusta", label: "clase de cerámica, torno", strength: 0.4 },
      { source: "google", kind: "le_gusta", label: "trote largo con el club de running", strength: 0.4 },
      { source: "google", kind: "le_gusta", label: "Running, sin apuro", strength: 0.3 },
    ]);
    expect(JSON.stringify(signals)).not.toMatch(/ansiedad|Pedro|otra\.persona|delantal|Finanzas|Visto una vez/);
  });

  it("gives the same signals for the same export, and refuses what is not a ZIP", () => {
    expect(takeoutSignals(TAKEOUT)).toEqual(takeoutSignals(TAKEOUT));
    expect(() => takeoutSignals(Buffer.from("esto no es un zip"))).toThrow();
    expect(unzip(zipOf({ "a.txt": "hola" }))[0].read().toString()).toBe("hola");
  });
});

describe("receiveTakeout", () => {
  it("filters on the way in and leaves the rest in the inbox of the phone that started the flow", async () => {
    const inbox = createInboxStore();
    const classify = vi.fn(async (topics: { name: string }[]) => topics.map((t) => ({ privacy: { level: t.name.includes("running") ? ("sensible" as const) : ("segura" as const) } })));
    expect(await receiveTakeout("este-telefono", TAKEOUT, { inbox, classify })).toEqual({ accepted: 2, held: 2 });
    expect(inbox.drainOwner("este-telefono").signals.map((s) => s.label)).toEqual(["torno & barro", "clase de cerámica, torno"]);
    expect(inbox.drainOwner("otro-telefono").signals).toEqual([]);
  });

  it("does not call the filter when the export has nothing to read", async () => {
    const classify = vi.fn();
    expect(await receiveTakeout("este-telefono", zipOf({ "Takeout/leeme.html": "<p>hola</p>" }), { inbox: createInboxStore(), classify })).toEqual({ accepted: 0, held: 0 });
    expect(classify).not.toHaveBeenCalled();
  });
});

describe("the flow with Google", () => {
  const config = { clientId: "123456-abc.apps.googleusercontent.com", clientSecret: "secreto" };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

  it("asks only for the per-file Drive permission", () => {
    const url = new URL(googleAuthUrl(config.clientId, "https://minga.example/api/google/callback", "estado"));
    expect(Object.fromEntries(url.searchParams)).toEqual({ client_id: config.clientId, redirect_uri: "https://minga.example/api/google/callback", state: "estado", response_type: "code", scope: DRIVE_FILE_SCOPE });
  });

  it("each step id works once and expires", () => {
    const flow = createGoogleFlow(1000);
    const state = flow.put("este-telefono", undefined, 0);
    expect(flow.take(state, 500)).toMatchObject({ owner: "este-telefono" });
    expect(flow.take(state, 500)).toBeNull();
    expect(flow.take(flow.put("este-telefono", "token", 0), 1001)).toBeNull();
    expect(flow.take("inventado")).toBeNull();
    expect(flow.take(null)).toBeNull();
  });

  it("exchanges the code, and gives nothing when Google refuses or the permission was left unticked", async () => {
    const granted = vi.fn(async () => json({ access_token: "token", scope: `openid ${DRIVE_FILE_SCOPE}` }));
    expect(await exchangeGoogleCode(config, "codigo", "https://minga.example/api/google/callback", granted as unknown as typeof fetch)).toBe("token");
    expect(String((granted.mock.calls[0] as unknown as [string, { body: URLSearchParams }])[1].body)).toContain("grant_type=authorization_code");
    expect(await exchangeGoogleCode(config, "codigo", "x", (async () => json({ access_token: "token", scope: "openid" })) as unknown as typeof fetch)).toBeNull();
    expect(await exchangeGoogleCode(config, "codigo", "x", (async () => json({ error: "invalid_grant" }, 400)) as unknown as typeof fetch)).toBeNull();
  });

  it("downloads only the picked file, and refuses one that is too large", async () => {
    const drive = vi.fn(async () => new Response(new Uint8Array(TAKEOUT)));
    expect((await downloadDriveFile("token", "id_del-archivo", drive as unknown as typeof fetch))?.equals(TAKEOUT)).toBe(true);
    expect(drive.mock.calls[0]).toEqual(["https://www.googleapis.com/drive/v3/files/id_del-archivo?alt=media", { headers: { authorization: "Bearer token" } }]);
    expect(await downloadDriveFile("token", "x", (async () => new Response("", { headers: { "content-length": String(301 * 2 ** 20) } })) as unknown as typeof fetch)).toBeNull();
    expect(await downloadDriveFile("token", "x", (async () => new Response("", { status: 403 })) as unknown as typeof fetch)).toBeNull();
  });

  it("the picker page carries the project number as app id and cannot be broken out of", () => {
    const html = googlePickerPage({ accessToken: "</script><script>alert(1)", clientId: config.clientId, pick: "elegir" });
    expect(html).toContain('"appId":"123456"');
    expect(html).not.toContain("</script><script>alert(1)");
  });
});
