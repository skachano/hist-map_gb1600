import { describe, expect, it } from "vitest";
import { ALIX, DUCHY, ENTRIES, FOLLOW, DIFFER, linkedPlaces, namedDivisions } from "./compare";

// The section names places by id: they must survive a rebuild of the data. (web/public/data/, built by make)
const files = import.meta.glob("../../public/data/places.json", { eager: true, import: "default" });
const places = () => {
  const json = files["../../public/data/places.json"];
  if (!json) throw new Error("web/public/data/places.json is missing: build the data first");
  return json as { id: string }[];
};

describe("Hiegel and Alix compared", () => {
  it("links only to places the atlas has", () => {
    const ids = new Set(places().map((p) => p.id));
    expect(linkedPlaces().filter((id) => !ids.has(id))).toEqual([]);
  });
  it("gives every entry it cites", () => {
    const cited = [...DIFFER.flatMap((g) => g.rows.flatMap((r) => r.entries)), ...FOLLOW.map((r) => r.entry)];
    expect(cited.filter((no) => !ENTRIES[no])).toEqual([]);
  });
  it("names every division of Alix's in each language", () => {
    expect(namedDivisions().filter((id) => !ALIX[id])).toEqual([]);
  });
});

describe("hist_map_dl1594", () => {
  it("finds the atlas's name in every language", () => {
    for (const text of ["the Duchy of Lorraine atlas records it", "l'atlas du duché de Lorraine le reprend",
      "der Atlas des Herzogtums Lothringen verzeichnet", "ロレーヌ公国アトラスが収録"]) {
      expect(DUCHY.test(text)).toBe(true);
    }
    expect(DUCHY.test("Dénombrement du duché de Lorraine")).toBe(false);   // Alix's book
  });
});
