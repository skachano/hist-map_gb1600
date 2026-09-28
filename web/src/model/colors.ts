// Holder colours. A choropleth puts every colour next to every other, and only three
// categorical colours stay distinguishable for colour-blind readers in that setting
// (validated with the dataviz palette checker, all pairs, light surface). So three
// holders get a colour - by default the three most prominent overall - and every other
// holder shares a neutral grey. A holder keeps its colour whatever the year or filter.
// The tooltip, legend and panel name every holder, so identity never rests on colour alone.

import type { Entity } from "../data/types";

export const SERIES = ["#2a78d6", "#eb6834", "#1baf7a"];
export const OTHER = "#c3c2b7";
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
