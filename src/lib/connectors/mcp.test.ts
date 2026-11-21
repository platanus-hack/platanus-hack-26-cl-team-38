import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it, vi } from "vitest";
import { createInboxStore } from "./inbox";
import { createConnectorServer } from "./mcp";

// Stands in for the privacy filter: a topic or line is sensitive when it contains the word.
const classifier = (sensible: string[] = []) =>
  vi.fn(async (topics: { name: string }[]) => topics.map((t) => ({ privacy: { level: sensible.some((word) => t.name.includes(word)) ? ("sensible" as const) : ("segura" as const) }, judged: true })));

async function setup(sensible: string[] = []) {
  const store = createInboxStore();
  const { token, inbox: inboxId } = store.open();
  const classify = classifier(sensible);
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createConnectorServer({ inbox: store, classify }).connect(serverSide);
  const client = new Client({ name: "test", version: "0" });
  await client.connect(clientSide);
  const call = async (name: string, args: Record<string, unknown>) => {
    const result = await client.callTool({ name, arguments: args });
    return { isError: result.isError === true, text: (result.content as { text: string }[])[0].text };
  };
  return { store, classify, token, inboxId, client, call };
}

describe("createConnectorServer", () => {
  it("offers one tool for the profile and one for the signals", async () => {
    const { client } = await setup();
    expect((await client.listTools()).tools.map((tool) => tool.name).sort()).toEqual(["subir_perfil", "subir_senales"]);
  });

  it("subir_perfil filters the file line by line and leaves it in the phone's inbox", async () => {
    const { store, token, inboxId, call } = await setup(["medicación"]);
    const result = await call("subir_perfil", { token, source: "claude", markdown: "## Viajes\n- Prefiero hostales.\n- Tomo medicación para dormir." });
    expect(result).toEqual({ isError: false, text: expect.stringContaining("Recibido el perfil: 1 líneas. 1 líneas se descartaron") });
    expect(store.drainProfiles(inboxId)).toEqual([{ source: "claude", markdown: "## Viajes\n- Prefiero hostales." }]);
  });

  it("subir_senales filters the signals and leaves them in the phone's inbox", async () => {
    const { store, token, inboxId, call } = await setup(["mi diagnostico"]);
    const signal = (label: string) => ({ source: "claude", kind: "sabe", label, strength: 0.8 });
    const result = await call("subir_senales", { token, signals: [signal("pagos"), signal("mi diagnostico")] });
    expect(result).toEqual({ isError: false, text: expect.stringContaining("Recibidas 1 señales. 1 se descartaron") });
    expect(store.drain(inboxId)).toEqual([signal("pagos")]);
  });

  it("answers with an error, and does not run the filter, for a token that is not live", async () => {
    const { classify, call } = await setup();
    const result = await call("subir_perfil", { token: "inventado", source: "claude", markdown: "- Prefiero hostales." });
    expect(result).toEqual({ isError: true, text: expect.stringContaining("El permiso no existe o venció") });
    expect(classify).not.toHaveBeenCalled();
  });

  it("refuses signals that carry evidence", async () => {
    const { store, token, inboxId, call } = await setup();
    const result = await call("subir_senales", { token, signals: [{ source: "claude", kind: "sabe", label: "pagos", strength: 0.8, evidence: "me lo contó" }] });
    expect(result.isError).toBe(true);
    expect(store.drain(inboxId)).toEqual([]);
  });
});
