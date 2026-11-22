import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { CORS, preflight, publicOrigin, resourceMetadataUrl } from "@/lib/connectors/oauth";
import { connectorOAuth, connectorServer } from "@/lib/connectors/server";

// Remote MCP server for the assistant connector (claude.ai → Settings → Connectors → Add custom
// connector, with this route's URL). Stateless: every request gets its own server and transport,
// and answers as plain JSON, so nothing has to survive between calls or stay open.
// Without a valid token it answers 401 pointing at the OAuth metadata, which is how the assistant
// learns it has to ask the person to authorize (RFC 9728).
export async function POST(request: Request) {
  const auth = connectorOAuth.verify(request.headers.get("authorization"));
  if (!auth) {
    const invalid = request.headers.has("authorization") ? 'error="invalid_token", ' : "";
    return Response.json(
      { error: "invalid_token", error_description: "Falta autorizar el conector." },
      { status: 401, headers: { ...CORS, "www-authenticate": `Bearer ${invalid}resource_metadata="${resourceMetadataUrl(publicOrigin(request))}"` } },
    );
  }

  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await connectorServer(auth.owner).connect(transport);
  const response = await transport.handleRequest(request, { authInfo: { token: auth.token, clientId: auth.clientId, scopes: [], expiresAt: auth.expiresAt } });
  for (const [name, value] of Object.entries(CORS)) response.headers.set(name, value);
  return response;
}

// No server-initiated stream and no session to end: the protocol's answer for both is 405.
const notAllowed = () => new Response(null, { status: 405, headers: { allow: "POST" } });
export { notAllowed as GET, notAllowed as DELETE };
export const OPTIONS = preflight;
