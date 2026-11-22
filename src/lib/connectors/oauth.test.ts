import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { allowedRedirect, basicCredentials, createOAuth, ownerOf, publicOrigin, REFRESH_TTL_S } from "./oauth";

const CLAUDE = "https://claude.ai/api/mcp/auth_callback";
const VERIFIER = "v".repeat(50);
const CHALLENGE = createHash("sha256").update(VERIFIER).digest("base64url");
const OWNER = ownerOf("k".repeat(64));

function setup() {
  let clock = 1_000_000;
  const oauth = createOAuth({ secret: "s".repeat(64), now: () => clock });
  const advance = (ms: number) => (clock += ms);
  const register = (body: object = { redirect_uris: [CLAUDE] }) =>
    oauth.register(body).json as { client_id: string; client_secret?: string };
  const authorize = (clientId: string, extra: object = {}) =>
    oauth.authorize({
      client_id: clientId,
      redirect_uri: CLAUDE,
      response_type: "code",
      code_challenge: CHALLENGE,
      code_challenge_method: "S256",
      state: "xyz",
      code: oauth.phoneCode(OWNER).code,
      ...extra,
    });
  const codeFrom = (result: ReturnType<typeof authorize>) =>
    "redirect" in result ? new URL(result.redirect).searchParams.get("code")! : "";
  const exchange = (clientId: string, code: string, verifier = VERIFIER) =>
    oauth.token(
      new URLSearchParams({
        grant_type: "authorization_code",
        client_id: clientId,
        code,
        redirect_uri: CLAUDE,
        code_verifier: verifier,
      }),
    );
  return { oauth, advance, register, authorize, codeFrom, exchange };
}

describe("createOAuth", () => {
  it("connects an assistant end to end: register, phone code, authorize, token, and the token writes to that phone", () => {
    const { oauth, register, authorize, codeFrom, exchange } = setup();
    const { client_id } = register();
    const result = authorize(client_id);
    expect("redirect" in result && new URL(result.redirect).origin + new URL(result.redirect).pathname).toBe(CLAUDE);
    expect("redirect" in result && new URL(result.redirect).searchParams.get("state")).toBe("xyz");

    const { status, json } = exchange(client_id, codeFrom(result));
    expect(status).toBe(200);
    expect(oauth.verify(`Bearer ${json.access_token}`)).toMatchObject({ owner: OWNER, clientId: client_id });
  });

  it("only registers redirects to the assistants and to loopback", () => {
    const { oauth } = setup();
    expect(oauth.register({ redirect_uris: ["https://evil.example/cb"] }).status).toBe(400);
    expect(oauth.register({ redirect_uris: [CLAUDE, "http://localhost:6274/oauth/callback"] }).status).toBe(201);
    expect(allowedRedirect("http://localhost.evil.example/cb")).toBe(false);
    expect(allowedRedirect("https://claude.com/api/mcp/auth_callback")).toBe(true);
  });

  it("refuses a forged client id and a redirect the client did not register", () => {
    const { register, authorize } = setup();
    const { client_id } = register();
    expect(authorize(`${client_id.split(".")[0]}.forged`)).toMatchObject({ status: 400 });
    expect(authorize(client_id, { redirect_uri: "https://claude.com/api/mcp/auth_callback" })).toMatchObject({
      status: 400,
    });
  });

  it("uses a phone code once, and not after it expires", () => {
    const { oauth, advance, register } = setup();
    const { client_id } = register();
    const request = {
      client_id,
      redirect_uri: CLAUDE,
      response_type: "code",
      code_challenge: CHALLENGE,
      code_challenge_method: "S256",
    };
    const { code } = oauth.phoneCode(OWNER);
    expect("redirect" in oauth.authorize({ ...request, code: code.toLowerCase().replace("-", " ") })).toBe(true);
    expect(oauth.authorize({ ...request, code })).toMatchObject({ status: 400 });

    const late = oauth.phoneCode(OWNER).code;
    advance(11 * 60_000);
    expect(oauth.authorize({ ...request, code: late })).toMatchObject({ status: 400 });
  });

  it("checks PKCE and spends the authorization code on the first try", () => {
    const { register, authorize, codeFrom, exchange } = setup();
    const { client_id } = register();
    const code = codeFrom(authorize(client_id));
    expect(exchange(client_id, code, "w".repeat(50))).toMatchObject({ status: 400, json: { error: "invalid_grant" } });
    expect(exchange(client_id, code)).toMatchObject({ status: 400, json: { error: "invalid_grant" } });
  });

  it("does not let another client spend the code", () => {
    const { register, authorize, codeFrom, exchange } = setup();
    const first = register().client_id;
    const second = register({ redirect_uris: [CLAUDE], client_name: "otro" }).client_id;
    expect(exchange(second, codeFrom(authorize(first)))).toMatchObject({ status: 400 });
  });

  it("refreshes for the same phone, and access tokens expire", () => {
    const { oauth, advance, register, authorize, codeFrom, exchange } = setup();
    const { client_id } = register();
    const first = exchange(client_id, codeFrom(authorize(client_id))).json;
    advance(2 * 60 * 60_000);
    expect(oauth.verify(`Bearer ${first.access_token}`)).toBeNull();

    const refreshed = oauth.token(
      new URLSearchParams({ grant_type: "refresh_token", client_id, refresh_token: String(first.refresh_token) }),
    );
    expect(refreshed.status).toBe(200);
    expect(oauth.verify(`Bearer ${refreshed.json.access_token}`)?.owner).toBe(OWNER);

    expect(
      oauth.token(
        new URLSearchParams({ grant_type: "refresh_token", client_id, refresh_token: String(first.access_token) }),
      ).status,
    ).toBe(400);
    advance(REFRESH_TTL_S * 1000);
    expect(
      oauth.token(
        new URLSearchParams({ grant_type: "refresh_token", client_id, refresh_token: String(first.refresh_token) }),
      ).status,
    ).toBe(400);
  });

  it("does not accept a token signed with another secret, or a refresh token as access", () => {
    const { oauth, register, authorize, codeFrom, exchange } = setup();
    const { client_id } = register();
    const { json } = exchange(client_id, codeFrom(authorize(client_id)));
    const other = createOAuth({ secret: "t".repeat(64) });
    expect(other.verify(`Bearer ${json.access_token}`)).toBeNull();
    expect(oauth.verify(`Bearer ${json.refresh_token}`)).toBeNull();
    expect(oauth.verify(null)).toBeNull();
  });

  it("asks a confidential client for its secret, in the body or as Basic", () => {
    const { oauth, register, authorize, codeFrom } = setup();
    const { client_id, client_secret } = register({
      redirect_uris: [CLAUDE],
      token_endpoint_auth_method: "client_secret_basic",
    });
    const form = (code: string) =>
      new URLSearchParams({ grant_type: "authorization_code", code, code_verifier: VERIFIER });
    expect(
      oauth.token(new URLSearchParams([...form(codeFrom(authorize(client_id))), ["client_id", client_id]])).status,
    ).toBe(401);

    const basic = basicCredentials(
      `Basic ${Buffer.from(`${encodeURIComponent(client_id)}:${client_secret}`).toString("base64")}`,
    );
    expect(oauth.token(form(codeFrom(authorize(client_id))), basic).status).toBe(200);
  });
});

describe("publicOrigin", () => {
  it("trusts the proxy's protocol and host", () => {
    const request = new Request("http://localhost:10000/api/mcp", {
      headers: { host: "team-38.onrender.com", "x-forwarded-proto": "https" },
    });
    expect(publicOrigin(request)).toBe("https://team-38.onrender.com");
  });
});
