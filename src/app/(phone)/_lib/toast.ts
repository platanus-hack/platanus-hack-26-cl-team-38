"use client";

import { useSyncExternalStore } from "react";

// A short note after you do something ("Oscar agregado como Amigo"): one at a time, gone in 2.4 s.

type Toast = { id: number; text: string } | null;

let current: Toast = null;
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function toast(text: string) {
  current = { id: Date.now(), text };
  clearTimeout(timer);
  timer = setTimeout(() => {
    current = null;
    emit();
  }, 2400);
  emit();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useToast(): Toast {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
}
