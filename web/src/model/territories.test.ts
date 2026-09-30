import { describe, expect, it } from "vitest";
import type { Place } from "../data/types";
import { hierarchyOf, membersOf, realmGroup, territoryLevels } from "./territories";

const place = (id: string, kind: Place["kind"], type: string, parents: Place["parents"] = []): [string, Place] =>
  [id, { id, kind, type, name: { fr: id }, parents }];

const places = new Map<string, Place>([
  place("bailliage-allemagne", "territory", "bailiwick"),
  place("office-sierck", "territory", "office", [{ id: "bailliage-allemagne" }]),
  place("prevote", "territory", "provostship", [{ id: "office-sierck" }]),
  place("county-sarrewerden", "territory", "county", [{ id: "bailliage-allemagne", from: 1629 }]),
  place("anzeling", "settlement", "village", [{ id: "prevote" }, { id: "office-sierck" }]),
  place("bouquenom", "settlement", "town", [{ id: "county-sarrewerden" }]),
]);

describe("territory hierarchy", () => {
  it("assigns levels below the bailiwick, following membership years", () => {
    expect(Object.fromEntries(territoryLevels(1620, places))).toEqual({ "office-sierck": 1, prevote: 2 });
    expect(territoryLevels(1629, places).get("county-sarrewerden")).toBe(1);
  });

  it("counts levels within the administrative or the feudal hierarchy", () => {
    const split = new Map<string, Place>([
      ...places,
      place("office-forbach", "territory", "office", [{ id: "bailliage-allemagne" }]),
      place("lordship-forbach", "territory", "lordship", [{ id: "office-forbach" }]),
      place("mairie", "territory", "mayoralty", [{ id: "lordship-forbach" }]),
      place("marquisate", "territory", "marquisate", [{ id: "bailliage-allemagne", from: 1629 }]),
      place("county-dalem", "territory", "county",
        [{ id: "office-forbach" }, { id: "marquisate", from: 1629 }]),
    ]);
    const admin = territoryLevels(1620, split, undefined, "admin");
    expect([admin.get("office-forbach"), admin.get("mairie"), admin.has("lordship-forbach")]).toEqual([1, 2, false]);
    const feudal = territoryLevels(1620, split, undefined, "feudal");
    expect([feudal.get("lordship-forbach"), feudal.get("county-dalem"), feudal.has("office-forbach")])
      .toEqual([1, 1, false]);
    expect(territoryLevels(1630, split, undefined, "feudal").get("county-dalem")).toBe(2); // under the marquisate
  });

  it("lists a territory's direct members", () => {
    expect(membersOf("office-sierck", 1620, places)).toEqual({ territories: ["prevote"], settlements: ["anzeling"] });
    expect(membersOf("county-sarrewerden", 1620, places).settlements).toEqual(["bouquenom"]);
  });

  it("groups realm types into five coloured kinds and the rest", () => {
    expect([realmGroup("castellany"), realmGroup("fief"), realmGroup("county"), realmGroup("marquisate"),
      realmGroup("principality"), realmGroup("condominium")])
      .toEqual(["office", "lordship", "county", "marquisate", "principality", "other"]);
    expect([hierarchyOf("office"), hierarchyOf("mayoralty"), hierarchyOf("county"), hierarchyOf("condominium")])
      .toEqual(["admin", "admin", "feudal", "admin"]);
  });
});
