import { describe, expect, it } from "vitest";
import type { Place } from "../data/types";
import { membersOf, realmGroup, territoryLevels } from "./territories";

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

  it("lists a territory's direct members", () => {
    expect(membersOf("office-sierck", 1620, places)).toEqual({ territories: ["prevote"], settlements: ["anzeling"] });
    expect(membersOf("county-sarrewerden", 1620, places).settlements).toEqual(["bouquenom"]);
  });

  it("groups realm types into five coloured kinds and the rest", () => {
    expect([realmGroup("castellany"), realmGroup("fief"), realmGroup("county"), realmGroup("marquisate"),
      realmGroup("principality"), realmGroup("condominium")])
      .toEqual(["office", "lordship", "county", "marquisate", "principality", "other"]);
  });
});
