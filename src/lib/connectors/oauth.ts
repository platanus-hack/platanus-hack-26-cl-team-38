import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { APP_NAME } from "./assistant";

// OAuth 2.1 for the MCP connector (claude.ai → Add custom connector). There are no accounts: what
// a connector gets tied to is a phone, by its device key. The phone shows a short code and the
// person types it on the authorization page, so only whoever holds the phone chooses where the
// assistant's deliveries land. A token can only write into that phone's inbox, never read.
//
// Clients, access tokens and refresh tokens are sealed (HMAC) instead of stored, so a restart on
// Render does not disconnect anyone. Phone codes and authorization codes live minutes and are
// single use, so they stay in memory.
// shortcut: no revocation. A token stays valid until it expires; rotating MCP_OAUTH_SECRET drops them all.

export const ACCESS_TTL_S = 60 * 60;
export const REFRESH_TTL_S = 60 * 24 * 60 * 60;
export const PHONE_CODE_TTL_MS = 10 * 60_000;
const AUTH_CODE_TTL_MS = 2 * 60_000;

// Where an authorization code may be sent. Anything else could carry a person's code to a stranger.
const REDIRECTS = [
  "https://claude.ai/api/mcp/auth_callback",
  "https://claude.com/api/mcp/auth_callback",
  "https://chatgpt.com/connector_platform_oauth_redirect",
];
const LOOPBACK = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//;
export const allowedRedirect = (uri: string) => REDIRECTS.includes(uri) || LOOPBACK.test(uri);

// The inbox a phone reads with its device key. A hash, so a token never carries the key itself.
export const ownerOf = (deviceKey: string) => createHash("sha256").update(deviceKey).digest("hex");

const b64 = (data: Buffer | string) => Buffer.from(data).toString("base64url");
const random = (bytes = 32) => randomBytes(bytes).toString("base64url");

// No 0/O, 1/I/L: typed by hand from one screen into another.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const normalizeCode = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, "");
function phoneCode(): string {
  const bytes = randomBytes(8);
  const code = [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

const ClientSchema = z.object({ typ: z.literal("client"), r: z.array(z.string()), m: z.enum(["none", "client_secret_post", "client_secret_basic"]), n: z.string().optional() });
const GrantSchema = z.object({ typ: z.enum(["at", "rt"]), cid: z.string(), own: z.string(), exp: z.number() });
type Client = z.infer<typeof ClientSchema>;

const RegistrationSchema = z.object({
  redirect_uris: z.array(z.string()).min(1).max(5),
  token_endpoint_auth_method: z.enum(["none", "client_secret_post", "client_secret_basic"]).default("none"),
  client_name: z.string().max(100).optional(),
  grant_types: z.array(z.string()).optional(),
  response_types: z.array(z.string()).optional(),
});

const AuthorizeSchema = z.object({
  client_id: z.string().min(1),
  redirect_uri: z.string().optional(),
  response_type: z.string(),
  code_challenge: z.string().min(43).max(128),
  code_challenge_method: z.string(),
  state: z.string().max(2000).optional(),
  code: z.string().min(1).max(20),
});

export type OAuthResult = { status: number; json: Record<string, unknown> };
export type AuthorizeResult = { redirect: string } | { status: number; error: string };
const oauthError = (status: number, error: string, description: string): OAuthResult => ({ status, json: { error, error_description: description } });

export function createOAuth({ secret, now = () => Date.now() }: { secret: string; now?: () => number }) {
  const phoneCodes = new Map<string, { owner: string; expiresAt: number }>();
  const authCodes = new Map<string, { clientId: string; redirectUri: string; challenge: string; owner: string; expiresAt: number }>();

  const sign = (body: string) => b64(createHmac("sha256", secret).update(body).digest());

  function seal(payload: object): string {
    const body = b64(JSON.stringify(payload));
    return `${body}.${sign(body)}`;
  }

  function unseal<T>(token: string, schema: z.ZodType<T>): T | null {
    const [body, mac, extra] = token.split(".");
    if (!body || !mac || extra !== undefined) return null;
    const expected = Buffer.from(sign(body));
    const given = Buffer.from(mac);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
    try {
      return schema.safeParse(JSON.parse(Buffer.from(body, "base64url").toString())).data ?? null;
    } catch {
      return null;
    }
  }

  const clientSecret = (clientId: string) => sign(`client-secret:${clientId}`);

  function sweep(at: number) {
    for (const [code, entry] of phoneCodes) if (at > entry.expiresAt) phoneCodes.delete(code);
    for (const [code, entry] of authCodes) if (at > entry.expiresAt) authCodes.delete(code);
  }

  function tokens(clientId: string, owner: string): OAuthResult {
    const at = Math.floor(now() / 1000);
    return {
      status: 200,
      json: {
        access_token: seal({ typ: "at", cid: clientId, own: owner, exp: at + ACCESS_TTL_S }),
        token_type: "Bearer",
        expires_in: ACCESS_TTL_S,
        refresh_token: seal({ typ: "rt", cid: clientId, own: owner, exp: at + REFRESH_TTL_S }),
      },
    };
  }

  // A secret client proves itself with the secret we derived for it; a public one with PKCE alone.
  function authenticateClient(form: URLSearchParams, basic: { id: string; secret: string } | null): { clientId: string } | OAuthResult {
    const clientId = basic?.id ?? form.get("client_id");
    const client = clientId ? unseal(clientId, ClientSchema) : null;
    if (!clientId || !client) return oauthError(401, "invalid_client", "Cliente desconocido.");
    if (client.m === "none") return { clientId };
    const given = basic?.secret ?? form.get("client_secret");
    const expected = Buffer.from(clientSecret(clientId));
    if (!given || expected.length !== Buffer.from(given).length || !timingSafeEqual(expected, Buffer.from(given))) {
      return oauthError(401, "invalid_client", "Falta el secreto del cliente o no corresponde.");
    }
    return { clientId };
  }

  return {
    // RFC 7591. The client id is the sealed registration itself, so there is nothing to store.
    register(body: unknown): OAuthResult {
      const parsed = RegistrationSchema.safeParse(body);
      if (!parsed.success) return oauthError(400, "invalid_client_metadata", z.prettifyError(parsed.error));
      const { redirect_uris, token_endpoint_auth_method: method, client_name } = parsed.data;
      const refused = redirect_uris.find((uri) => !allowedRedirect(uri));
      if (refused) return oauthError(400, "invalid_redirect_uri", `No se aceptan redirecciones a ${refused}.`);

      const clientId = seal({ typ: "client", r: redirect_uris, m: method, n: client_name } satisfies Client);
      return {
        status: 201,
        json: {
          client_id: clientId,
          client_id_issued_at: Math.floor(now() / 1000),
          ...(method === "none" ? {} : { client_secret: clientSecret(clientId), client_secret_expires_at: 0 }),
          redirect_uris,
          token_endpoint_auth_method: method,
          grant_types: ["authorization_code", "refresh_token"],
          response_types: ["code"],
          ...(client_name ? { client_name } : {}),
        },
      };
    },

    // The phone asks for a code to type on the authorization page.
    phoneCode(owner: string): { code: string; expiresAt: number } {
      const at = now();
      sweep(at);
      const code = phoneCode();
      const expiresAt = at + PHONE_CODE_TTL_MS;
      phoneCodes.set(normalizeCode(code), { owner, expiresAt });
      return { code, expiresAt };
    },

    // The authorization page sends the request it was opened with plus the code from the phone.
    // An invalid client or redirect is never redirected to: the page shows the error instead.
    authorize(body: unknown): AuthorizeResult {
      const at = now();
      sweep(at);
      const parsed = AuthorizeSchema.safeParse(body);
      if (!parsed.success) return { status: 400, error: "El pedido de autorización está incompleto. Vuelve a conectar desde tu asistente." };
      const request = parsed.data;
      const client = unseal(request.client_id, ClientSchema);
      if (!client) return { status: 400, error: "El asistente no está registrado. Vuelve a conectar desde tu asistente." };
      const redirectUri = request.redirect_uri ?? (client.r.length === 1 ? client.r[0] : undefined);
      if (!redirectUri || !client.r.includes(redirectUri)) return { status: 400, error: "La dirección de regreso no corresponde a este asistente." };
      if (request.response_type !== "code" || request.code_challenge_method !== "S256") {
        return { status: 400, error: "El asistente pidió un tipo de autorización que no aceptamos." };
      }

      const key = normalizeCode(request.code);
      const phone = phoneCodes.get(key);
      if (!phone || at > phone.expiresAt) return { status: 400, error: "Ese código no existe o venció. Pide uno nuevo en tu teléfono." };
      phoneCodes.delete(key);

      const code = random();
      authCodes.set(code, { clientId: request.client_id, redirectUri, challenge: request.code_challenge, owner: phone.owner, expiresAt: at + AUTH_CODE_TTL_MS });
      const target = new URL(redirectUri);
      target.searchParams.set("code", code);
      if (request.state !== undefined) target.searchParams.set("state", request.state);
      return { redirect: target.toString() };
    },

    token(form: URLSearchParams, basic: { id: string; secret: string } | null = null): OAuthResult {
      const at = now();
      sweep(at);
      const client = authenticateClient(form, basic);
      if ("status" in client) return client;

      const grant = form.get("grant_type");
      if (grant === "authorization_code") {
        const code = form.get("code") ?? "";
        const entry = authCodes.get(code);
        authCodes.delete(code);
        if (!entry || at > entry.expiresAt || entry.clientId !== client.clientId) return oauthError(400, "invalid_grant", "El código no existe, venció o ya se usó.");
        const redirectUri = form.get("redirect_uri");
        if (redirectUri !== null && redirectUri !== entry.redirectUri) return oauthError(400, "invalid_grant", "La dirección de regreso no corresponde.");
        const verifier = form.get("code_verifier") ?? "";
        if (b64(createHash("sha256").update(verifier).digest()) !== entry.challenge) return oauthError(400, "invalid_grant", "code_verifier no corresponde (PKCE).");
        return tokens(client.clientId, entry.owner);
      }
      if (grant === "refresh_token") {
        const refresh = unseal(form.get("refresh_token") ?? "", GrantSchema);
        if (!refresh || refresh.typ !== "rt" || refresh.cid !== client.clientId || refresh.exp < at / 1000) {
          return oauthError(400, "invalid_grant", "El refresh token no es válido o venció.");
        }
        return tokens(client.clientId, refresh.own);
      }
      return oauthError(400, "unsupported_grant_type", "Solo authorization_code y refresh_token.");
    },

    // The inbox an access token writes into, or null.
    verify(authorization: string | null): { owner: string; clientId: string; token: string; expiresAt: number } | null {
      const token = authorization?.match(/^Bearer (.+)$/i)?.[1];
      const grant = token ? unseal(token, GrantSchema) : null;
      if (!token || !grant || grant.typ !== "at" || grant.exp < now() / 1000) return null;
      return { owner: grant.own, clientId: grant.cid, token, expiresAt: grant.exp };
    },
  };
}

export type OAuth = ReturnType<typeof createOAuth>;

export function basicCredentials(authorization: string | null): { id: string; secret: string } | null {
  const encoded = authorization?.match(/^Basic (.+)$/i)?.[1];
  if (!encoded) return null;
  const [id, ...rest] = Buffer.from(encoded, "base64").toString().split(":");
  return id && rest.length ? { id: decodeURIComponent(id), secret: decodeURIComponent(rest.join(":")) } : null;
}

// Render terminates TLS in front of the app, so the request URL alone says http.
export function publicOrigin(request: Request): string {
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? url.host;
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0].trim() ?? url.protocol.replace(":", "");
  return `${proto}://${host}`;
}

export const MCP_PATH = "/api/mcp";
export const resourceMetadataUrl = (origin: string) => `${origin}/.well-known/oauth-protected-resource${MCP_PATH}`;

export function protectedResourceMetadata(origin: string) {
  return { resource: `${origin}${MCP_PATH}`, authorization_servers: [origin], bearer_methods_supported: ["header"], resource_name: APP_NAME };
}

// Without client_id_metadata_document_supported, claude.ai registers through registration_endpoint.
export function authorizationServerMetadata(origin: string) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/oauth/token`,
    registration_endpoint: `${origin}/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
  };
}

// Discovery, registration and token run from a browser in some clients (MCP Inspector). No cookies
// are involved, so any origin may call them.
export const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "authorization, content-type, mcp-protocol-version",
  "access-control-expose-headers": "www-authenticate",
};

export const preflight = () => new Response(null, { status: 204, headers: CORS });

export function oauthJson({ status, json }: OAuthResult): Response {
  return Response.json(json, { status, headers: { ...CORS, "cache-control": "no-store" } });
}
