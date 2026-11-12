// Where a visitor stopped in each film, kept in this browser only, so play carries on from there on a later visit too and the
// film's card shows how far they got. Nothing leaves the device, and a browser that refuses storage simply starts over.
import { useSyncExternalStore } from "react";

const KEY = "mayor-edits-watched";
// The films remembered, the most recently watched first.
const KEEP = 40;
// A glance at the opening is not worth remembering, and a film stopped in its last seconds starts over next time.
const STARTED_SECONDS = 5;
const ENDING_SECONDS = 15;

interface Spot {
  at: number;
  of: number;
  when: number;
}
export type WatchBook = Record<string, Spot>;

// The book after a film was left at `at` seconds of `of`. Pure, so it is tested on its own.
export function nextBook(book: WatchBook, id: string, at: number, of: number, now: number): WatchBook {
  const { [id]: previous, ...others } = book;
  if (!(of > 0) || at < STARTED_SECONDS || at > of - ENDING_SECONDS) return previous ? others : book;
  const entries = Object.entries({ ...others, [id]: { at, of, when: now } })
    .sort(([, a], [, b]) => b.when - a.when)
    .slice(0, KEEP);
  return Object.fromEntries(entries);
}

let book: WatchBook | null = null;
const listeners = new Set<() => void>();

function read(): WatchBook {
  if (typeof window === "undefined") return {};
  if (book) return book;
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? "{}");
    book = parsed && typeof parsed === "object" ? (parsed as WatchBook) : {};
  } catch {
    book = {};
  }
  return book;
}

// The seconds to carry on from, or 0 to start at the beginning.
export function watchedAt(id: string): number {
  return read()[id]?.at ?? 0;
}

export function saveWatched(id: string, at: number, of: number) {
  const current = read();
  const next = nextBook(current, id, at, of, Date.now());
  if (next === current) return;
  book = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Only a convenience: this visit still remembers it.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Another tab of the site watching a film.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== KEY) return;
    book = null;
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

// How much of a film this visitor has watched, from 0 to 1, for its card. Always 0 on the server.
export function useWatchedShare(id: string): number {
  return useSyncExternalStore(
    subscribe,
    () => {
      const spot = read()[id];
      return spot ? Math.round((spot.at / spot.of) * 1000) / 1000 : 0;
    },
    () => 0,
  );
}
