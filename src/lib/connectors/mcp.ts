import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { APP_NAME, AssistantSourceSchema, IncomingSignalsSchema, LEAVE_OUT, type ClassifySignals } from "./assistant";
import type { InboxStore } from "./inbox";
import { receiveProfile, type ClassifyLines } from "./profile";
import { receiveSignals } from "./receive";

// The same two ways in as the HTTP routes, as tools of a remote MCP server ("custom connector").
// A chat cannot make requests from its sandbox, but it can call a connector: that call leaves from
// the assistant's own servers. The connector is authorized once with OAuth (oauth.ts), which ties
// it to a phone: `owner` is that phone's inbox, and each call opens a fresh permit into it so the
// deliveries go through the same checks and filter as the HTTP routes.

type Deps = {
  inbox: Pick<InboxStore, "openFor" | "has" | "deliver" | "deliverProfile">;
  classify: ClassifySignals & ClassifyLines;
};

// The person may ask without pasting the app's message, so the tools carry the rules themselves.
const WHEN = `Úsala cuando la persona te pida cargar o actualizar su perfil en ${APP_NAME}. Si te pegó el mensaje de ${APP_NAME}, sigue sus reglas; si no, arma la entrega con lo que ya sabes de ella y deja fuera lo de esta lista, aunque lo sepas:\n${LEAVE_OUT}`;

const answer = ({ status, message }: { status: number; message: string }) => ({
  content: [{ type: "text" as const, text: message }],
  isError: status >= 400,
});

export function createConnectorServer(deps: Deps, owner: string): McpServer {
  const permit = () => deps.inbox.openFor(owner).token;

  const server = new McpServer(
    { name: "nodos", version: "0.1.0" },
    {
      instructions: `${APP_NAME} recibe el perfil que una persona pide a su asistente. Todo pasa por un filtro de privacidad al llegar y queda como borrador privado en su teléfono: nada se publica desde aquí.`,
    },
  );

  server.registerTool(
    "subir_perfil",
    {
      title: "Subir perfil detallado",
      description: `Entrega a ${APP_NAME} el perfil detallado de la persona como Markdown (títulos "## " y viñetas "- ", una idea por viñeta, en primera persona y sin su nombre). ${WHEN}\nCada línea se revisa por separado y las que tocan datos sensibles se descartan: no las reescribas ni las vuelvas a enviar.`,
      inputSchema: {
        source: AssistantSourceSchema.describe("El asistente que eres."),
        markdown: z.string().describe("El contenido completo de perfil-nodos.md."),
      },
    },
    async ({ source, markdown }) => answer(await receiveProfile(permit(), source, markdown, deps)),
  );

  server.registerTool(
    "subir_senales",
    {
      title: "Subir señales",
      description: `Entrega a ${APP_NAME} las señales del perfil de la persona: entre 15 y 30 temas cortos (1 a 4 palabras, en minúsculas y en español) con su tipo y su fuerza, como los contaría ella al presentarse en un evento: oficio, lo que sabe, lo que practica, gustos, lo que busca y lo que ofrece. Sin "evidence" ni citas. ${WHEN}`,
      inputSchema: { signals: IncomingSignalsSchema },
    },
    async ({ signals }) => answer(await receiveSignals(permit(), signals, deps)),
  );

  return server;
}
