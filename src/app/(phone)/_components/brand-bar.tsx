"use client";

import Link from "next/link";
import { Avatar } from "./avatar";
import { Icon } from "./icons";
import { MingaMark } from "./minga-mark";
import { Mono } from "./ui";
import { COPY } from "../_lib/copy";
import type { Coincidence } from "../_lib/people";

const C = COPY.inicio;

/** Minga's mark and, on the right, your Contactos as a few faces (they lead to Contactos, or to Explorar while you have none). */
export function BrandBar({ contacts }: { contacts: Coincidence[] | undefined }) {
  return (
    <header className="topbar">
      <MingaMark />
      {COPY.app}
      {contacts && (
        <Link
          href={contacts.length ? "/afinidades" : "/coincidencias"}
          className="home-contacts"
          aria-label={contacts.length ? `${C.contacts}: ${contacts.length}` : C.contactsHint}
        >
          <span className="stack">
            {contacts.slice(0, 3).map((c) => (
              <Avatar key={c.person.personId} id={c.person.personId} />
            ))}
          </span>
          {contacts.length > 3 ? (
            <Mono>+{contacts.length - 3}</Mono>
          ) : contacts.length === 0 ? (
            <Icon name="users" />
          ) : null}
        </Link>
      )}
    </header>
  );
}
