import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { connectorServer } from "@/lib/connectors/server";

// Remote MCP server for the assistant connector (claude.ai → Settings → Connectors → Add custom
// connector, with this route's URL). Stateless: every request gets its own server and transport,
// and answers as plain JSON, so nothing has to survive between calls or stay open.
export async function POST(request: Request) {
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await connectorServer().connect(transport);
  return transport.handleRequest(request);
}

// No server-initiated stream and no session to end: the protocol's answer for both is 405.
const notAllowed = () => new Response(null, { status: 405, headers: { allow: "POST" } });
export { notAllowed as GET, notAllowed as DELETE };
