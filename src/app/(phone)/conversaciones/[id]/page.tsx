import type { Metadata } from "next";
import { Suspense } from "react";
import { Splash } from "../../_components/chrome";
import { Conversation } from "./conversation";

export const metadata: Metadata = { title: "Chat · Minga" };

export default function ConversacionPage({ params }: PageProps<"/conversaciones/[id]">) {
  return (
    <Suspense fallback={<Splash />}>
      <Conversation params={params} />
    </Suspense>
  );
}
