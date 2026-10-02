// Links to places from lists and panels. A territory opens the Territories view with the map fitted
// to the realm; a village picked from the table opens the rights map zoomed in on it. Clicks on the
// map itself only select: the reader is already looking at the place.
import type { Dataset } from "../data/types";
import { BAILIWICK, hierarchyOf, territoryLevels } from "../model/territories";
import type { State, Store } from "../state/store";

interface MapFocus {
  /** zoom in on this settlement when it is next selected */
  zoomTo(placeId: string): void;
  /** fit the map to this territory when it is next selected */
  fitTerritory(placeId: string): void;
}

let focus: MapFocus = { zoomTo: () => {}, fitTerritory: () => {} };

/** Called once by main with the map, which the views do not hold. */
export function setMapFocus(f: MapFocus): void {
  focus = f;
}

/** Select a place from a link: a territory switches to the Territories view, fitted to its area and
 *  listed: its hierarchy (an office among the administrative divisions, a lordship among the feudal
 *  realms), its level (a provostship in an office: the subdivisions; deeper: all levels) or, for a
 *  realm outside the bailiwick, the neighbours; a "kind of realm" filter that would hide it is cleared. */
export function openPlace(store: Store, data: Dataset, placeId: string, extra: Partial<State> = {}): void {
  const place = data.places.get(placeId);
  if (place?.kind === "territory") {
    const hierarchy = hierarchyOf(place.type);
    const kind = store.state.kind === place.type ? place.type : undefined;
    const depth = territoryLevels(extra.year ?? store.state.year, data.places, undefined, hierarchy).get(placeId);
    const level = depth === undefined ? store.state.level : depth <= 2 ? depth : 0;
    focus.fitTerritory(placeId);
    store.set({ ...extra, view: "territories", place: placeId, feudal: hierarchy === "feudal" || undefined, kind,
      level, ...(depth === undefined && placeId !== BAILIWICK ? { neighbours: true } : {}) });
  } else {
    store.set({ ...extra, place: placeId });
  }
}

/** A village picked from the table: the rights map, zoomed in on it. */
export function showOnMap(store: Store, placeId: string): void {
  focus.zoomTo(placeId);
  store.set({ view: "map", place: placeId });
}
