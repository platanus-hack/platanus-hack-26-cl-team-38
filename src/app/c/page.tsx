import type { Metadata } from "next";
import { DeliverLink } from "./deliver-link";

export const metadata: Metadata = { title: "Cargando tu perfil · team-38", robots: { index: false } };

// Landing for the link an assistant writes in a chat. The profile travels after the #, which the
// browser does not send when it opens the page: it only leaves the phone in the POST below.
export default function AssistantLinkPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
      <DeliverLink />
    </main>
  );
}
