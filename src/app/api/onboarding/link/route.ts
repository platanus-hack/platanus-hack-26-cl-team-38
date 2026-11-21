import { parseAssistantLink } from "@/lib/connectors/assistant";
import { receiveSignals } from "@/lib/connectors/server";

// Called by /c with what came after the # of a link the assistant wrote and the person tapped.
export async function POST(request: Request) {
  const { token, signals } = parseAssistantLink(await request.text());
  return receiveSignals(token, signals);
}
