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
  { group: "other", types: ["bailiwick", "imperial_circle", "condominium", "march"] },
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

/** The two hierarchies of realms: the bailiwick's districts, and the fiefs held of a lord. */
export type Hierarchy = "admin" | "feudal";
const FEUDAL_TYPES = new Set(KINDS.find((k) => k.group === "feudal")!.types);

export function hierarchyOf(placeType: string): Hierarchy {
  return FEUDAL_TYPES.has(placeType) ? "feudal" : "admin";
}

/** Territory id -> level below the bailiwick in `year` (1 = directly under it). With a hierarchy,
 *  only realms of that hierarchy are returned, and a level counts only the realms of that hierarchy
 *  on the way down: an office is level 1 and the provostship in it level 2 (fiefs in between are
 *  skipped; the shortest way counts); a lordship lying in an office is a level-1 fief, and a county
 *  inside a marquisate a level-2 one (the longest way counts, so it sits under its overlord). */
export function territoryLevels(year: number, places: Map<string, Place>,
  children = childrenIn(year, places), hierarchy?: Hierarchy): Map<string, number> {
  const inside = new Set<string>(); // every realm under the bailiwick this year
  for (let frontier = [BAILIWICK]; frontier.length;) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const child of children.get(id) ?? []) {
        if (places.get(child)?.kind === "territory" && !inside.has(child) && child !== BAILIWICK) {
          inside.add(child);
          next.push(child);
        }
      }
    }
    frontier = next;
  }
  const counts = (id: string) => !hierarchy || hierarchyOf(places.get(id)?.type ?? "") === hierarchy;
  const pick = hierarchy === "feudal" ? Math.max : Math.min;
  const memo = new Map<string, number>();
  const visiting = new Set<string>();
  const depth = (id: string): number => {
    if (id === BAILIWICK) return 0;
    const known = memo.get(id);
    if (known !== undefined) return known;
    if (visiting.has(id)) return 0; // a membership cycle: stop here
    visiting.add(id);
    const above = (places.get(id)?.parents ?? [])
      .filter((p) => isActive(p, year) && (p.id === BAILIWICK || inside.has(p.id))).map((p) => depth(p.id));
    const d = (counts(id) ? 1 : 0) + (above.length ? pick(...above) : 0);
    visiting.delete(id);
    memo.set(id, d);
    return d;
  };
  const levels = new Map<string, number>();
  for (const id of inside) if (counts(id)) levels.set(id, depth(id));
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
