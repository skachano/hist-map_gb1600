import { describe, expect, it } from "vitest";
import { parseHash, Store, toHash } from "./store";

const years: [number, number] = [1600, 1632];
const rights = new Set(["suzerain", "high_justice"]);

describe("URL state", () => {
  it("round-trips through the hash", () => {
    const state = { view: "map" as const, year: 1624, right: "high_justice", lang: "fr" as const, place: "anzeling" };
    expect(parseHash(toHash(state), years, rights)).toEqual({ ...state, entity: undefined, colours: undefined });
    const entityView = { ...state, view: "entity" as const, entity: "duchy-lorraine", colours: ["a", "b"] };
    expect(parseHash(toHash(entityView), years, rights)).toEqual(entityView);
  });

  it("falls back to safe defaults for bad input", () => {
    const s = parseHash("#/map?year=1700&right=nonsense&lang=xx", years, rights);
    expect(s.year).toBe(1600);
    expect(s.right).toBe("suzerain");
    expect(["en", "fr", "de"]).toContain(s.lang);
  });
});

describe("Store", () => {
  it("notifies only on real changes", () => {
    const store = new Store({ view: "map", year: 1600, right: "suzerain", lang: "en" });
    const seen: number[] = [];
    store.subscribe((s) => seen.push(s.year));
    store.set({ year: 1600 });
    store.set({ year: 1601 });
    expect(seen).toEqual([1601]);
  });
});
