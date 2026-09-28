import { describe, expect, it } from "vitest";
import type { Entity, Place, Right } from "../data/types";
import { activeRows, ancestors, indexRights, isActive, placeRight } from "./snapshot";

const entities = new Map<string, Entity>([
  ["duchy-lorraine", { id: "duchy-lorraine", type: "duchy", name: { en: "Lorraine" }, rank: 1 }],
  ["electorate-trier", { id: "electorate-trier", type: "electorate", name: { en: "Trier" }, rank: 2 }],
  ["henriette", { id: "henriette", type: "person", name: { en: "Henriette" }, rank: 9 }],
  ["abbey", { id: "abbey", type: "abbey", name: { en: "Abbey" }, rank: 5 }],
]);

const places = new Map<string, Place>([
  ["office", { id: "office", kind: "territory", type: "office", name: { fr: "Office" } }],
  ["prevote", { id: "prevote", kind: "territory", type: "provostship", name: { fr: "Prévôté" },
    parents: [{ id: "office" }] }],
  ["village", { id: "village", kind: "settlement", type: "village", name: { fr: "Village" },
    parents: [{ id: "prevote" }, { id: "late-office", from: 1629 }] }],
  ["late-office", { id: "late-office", kind: "territory", type: "office", name: { fr: "Late" } }],
]);

const r = (row: Partial<Right>): Right => ({ place: "village", right: "high_justice", holder: "duchy-lorraine", ...row });

describe("isActive", () => {
  it("treats missing years as open and years as inclusive", () => {
    expect(isActive({}, 1600)).toBe(true);
    expect(isActive({ to: 1624 }, 1624)).toBe(true);
    expect(isActive({ to: 1624 }, 1625)).toBe(false);
    expect(isActive({ from: 1629 }, 1628)).toBe(false);
  });
});

describe("activeRows", () => {
  it("gives a transfer year to the incoming holder (Anzeling 1624)", () => {
    const rows = [r({ to: 1624 }), r({ holder: "henriette", status: "pledged", from: 1624 })];
    expect(activeRows(rows, 1623).map((x) => x.holder)).toEqual(["duchy-lorraine"]);
    expect(activeRows(rows, 1624).map((x) => x.holder)).toEqual(["henriette"]);
    expect(activeRows(rows, 1625).map((x) => x.holder)).toEqual(["henriette"]);
  });

  it("keeps co-holders that do not change", () => {
    const rows = [r({ share: "1/2" }), r({ holder: "electorate-trier", share: "1/2" })];
    expect(activeRows(rows, 1620)).toHaveLength(2);
  });
});

describe("placeRight", () => {
  it("colours a condominium by the more prominent co-holder and marks it shared", () => {
    const index = indexRights([r({ right: "suzerain", share: "1/2", holder: "electorate-trier" }),
      r({ right: "suzerain", share: "1/2" })]);
    const pr = placeRight("village", "suzerain", 1610, index, places, entities);
    expect(pr.primary).toBe("duchy-lorraine");
    expect(pr.shared).toBe(true);
    expect(pr.contested).toBe(false);
  });

  it("prefers the larger share", () => {
    const index = indexRights([r({ share: "1/4" }), r({ holder: "abbey", share: "3/4" })]);
    expect(placeRight("village", "high_justice", 1610, index, places, entities).primary).toBe("abbey");
  });

  it("flags claims and disputes but does not colour by a mere claimant", () => {
    const index = indexRights([
      r({ right: "middle_low_justice", holder: "abbey" }),
      r({ right: "middle_low_justice", status: "claimed", disputed: true, against: ["abbey"], from: 1616, to: 1620 }),
    ]);
    const during = placeRight("village", "middle_low_justice", 1618, index, places, entities);
    expect(during.primary).toBe("abbey");
    expect(during.contested).toBe(true);
    expect(placeRight("village", "middle_low_justice", 1621, index, places, entities).contested).toBe(false);
  });

  it("inherits from the nearest territory with rows, respecting membership years", () => {
    const index = indexRights([
      { place: "office", right: "suzerain", holder: "duchy-lorraine" },
      { place: "late-office", right: "advocate", holder: "abbey" },
    ]);
    const suz = placeRight("village", "suzerain", 1610, index, places, entities);
    expect(suz).toMatchObject({ primary: "duchy-lorraine", inheritedFrom: "office" });
    expect(placeRight("village", "advocate", 1628, index, places, entities).primary).toBeUndefined();
    expect(placeRight("village", "advocate", 1629, index, places, entities).inheritedFrom).toBe("late-office");
  });

  it("uses own rows before inherited ones", () => {
    const index = indexRights([
      { place: "office", right: "high_justice", holder: "duchy-lorraine" },
      r({ holder: "abbey" }),
    ]);
    const pr = placeRight("village", "high_justice", 1610, index, places, entities);
    expect(pr).toMatchObject({ primary: "abbey", inheritedFrom: undefined });
  });
});

describe("ancestors", () => {
  it("walks memberships breadth-first and survives cycles", () => {
    const cyclic = new Map(places);
    cyclic.set("office", { ...places.get("office")!, parents: [{ id: "prevote" }] });
    expect(ancestors("village", 1610, cyclic)).toEqual(["prevote", "office"]);
    expect(ancestors("village", 1630, places)).toEqual(["prevote", "late-office", "office"]);
  });
});

import { directHoldings, disputesIn, timeline } from "./snapshot";

describe("timeline", () => {
  it("merges years into runs and records the handover", () => {
    const index = indexRights([r({ to: 1624 }), r({ holder: "henriette", status: "pledged", from: 1624 })]);
    const segs = timeline("village", "high_justice", [1600, 1632], index, places, entities);
    expect(segs.map((s) => [s.holder, s.from, s.to, s.status])).toEqual([
      ["duchy-lorraine", 1600, 1623, "held"], ["henriette", 1624, 1632, "pledged"]]);
  });

  it("marks inherited runs", () => {
    const index = indexRights([{ place: "late-office", right: "suzerain", holder: "abbey" }]);
    const segs = timeline("village", "suzerain", [1627, 1632], index, places, entities);
    expect(segs).toEqual([expect.objectContaining({ holder: "abbey", from: 1629, to: 1632, inheritedFrom: "late-office" })]);
  });
});

describe("disputesIn / directHoldings", () => {
  const rows = [
    r({ right: "middle_low_justice", holder: "abbey" }),
    r({ right: "middle_low_justice", status: "claimed", disputed: true, against: ["abbey"], from: 1616, to: 1620 }),
  ];
  it("lists disputes only in their years", () => {
    const index = indexRights(rows);
    expect(disputesIn(1618, index)).toEqual([expect.objectContaining({ place: "village", right: "middle_low_justice",
      against: ["abbey"] })]);
    expect(disputesIn(1625, index)).toEqual([]);
  });
  it("collects an entity's own rows by right type", () => {
    expect([...directHoldings("duchy-lorraine", 1618, rows).keys()]).toEqual(["middle_low_justice"]);
    expect(directHoldings("duchy-lorraine", 1625, rows).size).toBe(0);
  });
});
