// The territorial hierarchy in a given year: which realms sit directly under the
// bailiwick (level 1), which under those (level 2), and what each one contains.
import type { Place } from "../data/types";
import { isActive } from "./snapshot";

export const BAILIWICK = "bailliage-allemagne";

/** Kinds of realm, five coloured groups plus the rest (see model/colors.ts). The feudal titles have a
 *  group each, by rank below the duchy: principality, marquisate, county, lordship. */
const GROUPS: Record<string, Exclude<RealmGroup, "other">> = {
  office: "office", castellany: "office", provostship: "office", receivership: "office", bailiwick: "office",
  lordship: "lordship", fief: "lordship", barony: "lordship", advocacy: "lordship", allod: "lordship",
  county: "county", marquisate: "marquisate", principality: "principality",
};
export type RealmGroup = "office" | "principality" | "marquisate" | "county" | "lordship" | "other";

export function realmGroup(placeType: string): RealmGroup {
  return GROUPS[placeType] ?? "other";
}

/** Realm types for the Territories view's "kind of realm" menu: administrative districts, feudal
 *  titles by rank (below the duchy), and the rest. */
export const KINDS: { group: "administrative" | "feudal" | "other"; types: string[] }[] = [
  { group: "administrative", types: ["office", "provostship", "castellany", "receivership", "mayoralty", "sergeantry",
    "court", "ban"] },
  { group: "feudal", types: ["principality", "marquisate", "county", "barony", "lordship", "fief", "advocacy", "allod"] },
  { group: "other", types: ["bailiwick", "condominium", "march"] },
];

/** The place types in one coloured group. */
export function typesIn(group: Exclude<RealmGroup, "other">): string[] {
  return Object.keys(GROUPS).filter((t) => GROUPS[t] === group);
}

/** parent id -> ids of the places that belonged to it in `year` */
export function childrenIn(year: number, places: Map<string, Place>): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const p of places.values()) {
    for (const parent of p.parents ?? []) {
      if (!isActive(parent, year)) continue;
      const list = out.get(parent.id);
      if (list) list.push(p.id);
      else out.set(parent.id, [p.id]);
    }
  }
  return out;
}

/** Territory id -> depth below the bailiwick in `year` (1 = directly under it). */
export function territoryLevels(year: number, places: Map<string, Place>,
  children = childrenIn(year, places)): Map<string, number> {
  const levels = new Map<string, number>();
  let frontier = [BAILIWICK];
  for (let depth = 1; frontier.length; depth++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const child of children.get(id) ?? []) {
        if (places.get(child)?.kind === "territory" && !levels.has(child) && child !== BAILIWICK) {
          levels.set(child, depth);
          next.push(child);
        }
      }
    }
    frontier = next;
  }
  return levels;
}

/** Direct members of a territory in `year`: sub-territories and settlements. */
export function membersOf(id: string, year: number, places: Map<string, Place>,
  children = childrenIn(year, places)): { territories: string[]; settlements: string[] } {
  const direct = children.get(id) ?? [];
  return {
    territories: direct.filter((c) => places.get(c)?.kind === "territory"),
    settlements: direct.filter((c) => places.get(c)?.kind === "settlement"),
  };
}
