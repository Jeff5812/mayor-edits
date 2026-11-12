import { describe, expect, it } from "vitest";
import { type WatchBook, nextBook } from "./watch-progress";

describe("where each film was left", () => {
  it("remembers a film stopped part-way", () => {
    expect(nextBook({}, "a", 120, 600, 1)).toEqual({ a: { at: 120, of: 600, when: 1 } });
  });

  it("forgets a glance at the opening and a film watched to its end", () => {
    const book: WatchBook = { a: { at: 120, of: 600, when: 1 } };
    expect(nextBook(book, "a", 3, 600, 2)).toEqual({});
    expect(nextBook(book, "a", 590, 600, 2)).toEqual({});
    // Nothing to forget leaves the same book, so nobody is told about a change.
    expect(nextBook({}, "b", 3, 600, 2)).toEqual({});
    expect(nextBook(book, "b", 3, 600, 2)).toBe(book);
  });

  it("keeps the forty most recently watched films", () => {
    let book: WatchBook = {};
    for (let film = 0; film < 45; film += 1) book = nextBook(book, `film-${film}`, 60, 600, film);
    expect(Object.keys(book)).toHaveLength(40);
    expect(book["film-44"]).toBeDefined();
    expect(book["film-4"]).toBeUndefined();
  });

  it("ignores a film whose length is not known", () => {
    expect(nextBook({}, "a", 120, 0, 1)).toEqual({});
    expect(nextBook({}, "a", 120, Number.NaN, 1)).toEqual({});
  });
});
