import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { APP_NAME, AssistantSourceSchema, IncomingSignalsSchema, type ClassifySignals } from "./assistant";
import type { InboxStore } from "./inbox";
import { receiveProfile, type ClassifyLines } from "./profile";
import { receiveSignals } from "./receive";

// The same two ways in as the HTTP routes, as tools of a remote MCP server ("custom connector").
// A chat cannot make requests from its sandbox, but it can call a connector: that call leaves from
// the assistant's own servers. No accounts and no OAuth: the permit the person copies from the app
// travels as an argument, and without a live one nothing runs.

type Deps = { inbox: Pick<InboxStore, "has" | "deliver" | "deliverProfile">; classify: ClassifySignals & ClassifyLines };

const TOKEN = z.string().describe(`El permiso temporal que viene en el mensaje que la persona copió desde ${APP_NAME}.`);
const WHEN = `Úsala solo cuando la persona te pegó el mensaje de ${APP_NAME} con su permiso, y sigue las reglas de ese mensaje sobre qué incluir y qué dejar fuera.`;

const answer = ({ status, message }: { status: number; message: string }) => ({ content: [{ type: "text" as const, text: message }], isError: status >= 400 });

export function createConnectorServer(deps: Deps): McpServer {
  const server = new McpServer(
    { name: "nodos", version: "0.1.0" },
    { instructions: `${APP_NAME} recibe el perfil que una persona pide a su asistente. Todo pasa por un filtro de privacidad al llegar y queda como borrador privado en su teléfono: nada se publica desde aquí.` },
  );

  server.registerTool(
    "subir_perfil",
    {
      title: "Subir perfil detallado",
      description: `Entrega a ${APP_NAME} el perfil detallado de la persona como Markdown (títulos "## " y viñetas "- ", una idea por viñeta). ${WHEN} Cada línea se revisa por separado y las que tocan datos sensibles se descartan: no las reescribas ni las vuelvas a enviar.`,
      inputSchema: {
        token: TOKEN,
        source: AssistantSourceSchema.describe("El asistente que eres."),
        markdown: z.string().describe("El contenido completo de perfil-nodos.md."),
      },
    },
    async ({ token, source, markdown }) => answer(await receiveProfile(token, source, markdown, deps)),
  );

  server.registerTool(
    "subir_senales",
    {
      title: "Subir señales",
      description: `Entrega a ${APP_NAME} las señales del perfil de la persona: temas cortos con su tipo y su fuerza. ${WHEN} Sin "evidence" ni citas.`,
      inputSchema: { token: TOKEN, signals: IncomingSignalsSchema },
    },
    async ({ token, signals }) => answer(await receiveSignals(token, signals, deps)),
  );

  return server;
}
