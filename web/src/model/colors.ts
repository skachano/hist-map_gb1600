// Holder colours. A choropleth puts every colour next to every other, and only three
// categorical colours stay distinguishable for colour-blind readers in that setting
// (validated with the dataviz palette checker, all pairs, light surface). So three
// holders get a colour - by default the three most prominent overall - and every other
// holder shares a neutral grey. A holder keeps its colour whatever the year or filter.
// The tooltip, legend and panel name every holder, so identity never rests on colour alone.

import type { Entity } from "../data/types";

export const SERIES = ["#2a78d6", "#eb6834", "#1baf7a"];
export const OTHER = "#c3c2b7";
/** Territories view only: marquisates, a fourth kind of realm. Violet (categorical slot 7) is the one
 *  fourth hue that validates all-pairs against SERIES and OTHER on a map (dataviz checker: worst CVD
 *  ΔE 9.2, normal-vision 16.3); realm names are always labelled on the map and listed beside it. */
export const MARQUISATE = "#4a3aa7";
/** Territories view only: principalities. No fifth hue validates on a map; yellow (slot 4) passes the
 *  CVD check (ΔE 9.1) but not the normal-vision floor next to the orange lordships (13.7 < 15), accepted
 *  by choice. The realm names on the map and in the list carry the distinction. */
export const PRINCIPALITY = "#eda100";
/** Territories view only: the other realms (condominiums, bans, mairies, courts...). The holders' neutral
 *  grey (OTHER) vanishes on the grey basemap at the areas' opacity; this is the palette's darker muted
 *  neutral, so the areas read without taking a hue. */
export const REALM_OTHER = "#898781";
export const CONTESTED = "#d03b3b"; // status "critical": always paired with a mark and a label

export function colouredHolders(entities: Map<string, Entity>, pinned?: string[]): string[] {
  if (pinned?.length) return pinned.slice(0, SERIES.length);
  return [...entities.values()].sort((a, b) => a.rank - b.rank).slice(0, SERIES.length).map((e) => e.id);
}

export function holderColour(holder: string | undefined, coloured: string[]): string | undefined {
  if (!holder) return undefined;
  const i = coloured.indexOf(holder);
  return i >= 0 ? SERIES[i] : OTHER;
}
