"use client";

import { useEffect } from "react";

// A thread that grows at the bottom: while you are at the end, whatever arrives pushes the rest up
// and stays in view; once you scroll up to read, it leaves you there. On a phone the page scrolls,
// on a desktop the framed .app does.

const NEAR_PX = 120;

function scrollerOf(el: HTMLElement): HTMLElement {
  for (let p = el.parentElement; p; p = p.parentElement) {
    if (/(auto|scroll)/.test(getComputedStyle(p).overflowY)) return p;
  }
  return document.scrollingElement as HTMLElement;
}

export function useStickToBottom(content: HTMLElement | null) {
  useEffect(() => {
    if (!content) return;
    const scroller = scrollerOf(content);
    const events: HTMLElement | Window = scroller === document.scrollingElement ? window : scroller;
    let pinned = true;
    const onScroll = () => {
      pinned = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < NEAR_PX;
    };
    const follow = () => {
      if (pinned) scroller.scrollTo({ top: scroller.scrollHeight });
    };
    events.addEventListener("scroll", onScroll, { passive: true });
    const observer = new ResizeObserver(follow);
    observer.observe(content);
    return () => {
      events.removeEventListener("scroll", onScroll);
      observer.disconnect();
    };
  }, [content]);
}
