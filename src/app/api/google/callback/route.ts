import { exchangeGoogleCode, googleConfig, googleMessagePage, googlePickerPage } from "@/lib/connectors/google";
import { publicOrigin } from "@/lib/connectors/oauth";
import { googleFlow } from "@/lib/connectors/server";

// no-store: the picker page carries Google's short-lived token for this one person.
const html = (body: string, status = 200) =>
  new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });

// Google sends the person back here. The state is checked before the code is exchanged, and then
// the page with Google's file picker is served: the person picks their export there.
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const step = googleFlow.take(query.get("state"));
  const code = query.get("code");
  const config = googleConfig();
  const accessToken =
    step && code && config
      ? await exchangeGoogleCode(config, code, `${publicOrigin(request)}/api/google/callback`).catch(() => null)
      : null;
  if (!step || !config || !accessToken)
    return html(googleMessagePage("Google no autorizó ver tu exportación, o este enlace ya se usó."), 400);
  return html(
    googlePickerPage({ accessToken, clientId: config.clientId, pick: googleFlow.put(step.owner, accessToken) }),
  );
}
