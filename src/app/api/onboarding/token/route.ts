import { assistantInbox } from "@/lib/connectors/server";

// The phone asks for a message to paste into its assistant. `token` goes inside that message and
// can only write; `inbox` stays on the phone and can only read.
export async function POST() {
  return Response.json(assistantInbox.open());
}
