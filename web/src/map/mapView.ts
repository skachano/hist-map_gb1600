// The map: settlement cells and points styled per place by the active view, overlays
// for shared (hatched) and pledged (dashed) rights, and the bailiwick outline for the year.
import {
  type FilterSpecification, type GeoJSONSource, Map as MapLibre, type MapGeoJSONFeature, type MapMouseEvent, Marker,
  setWorkerUrl,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
// MapLibre looks for its worker next to its own module, which bundling moves; hand it
// Vite's bundled copy instead (same in dev and in the production build).
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { MAP_CENTER, MAP_ZOOM, PLACE_ZOOM, TERRITORY_ZOOM } from "../config";
import type { Dataset } from "../data/types";
import { CONTESTED, MARQUISATE, PRINCIPALITY, REALM_OTHER, SERIES } from "../model/colors";
import { typesIn } from "../model/territories";
import { ICON_PIXEL_RATIO, iconName, SHAPES, shapeImage } from "./icons";

const BASEMAP_STYLE = "https://tiles.openfreemap.org/styles/positron";
const BASEMAP_DROP = /^(building|aeroway|airport|road_area_pier|road_pier|highway_path|highway_minor|highway-name|highway-shield|road_shield|railway|tunnel|label_village|label_other)/;

setWorkerUrl(workerUrl);

/** How one place is drawn in the current view. */
export interface PlaceStyle {
  fill?: string;
  /** the right comes from a territory the place belonged to: drawn lighter */
  inherited?: boolean;
  contested?: boolean;
  /** several holders at once: hatched cell */
  shared?: boolean;
  /** held in pledge (engagement): dashed outline */
  pledged?: boolean;
}

export interface MapCallbacks {
  onHover(placeId: string | undefined, point: { x: number; y: number }): void;
  onSelect(placeId: string | undefined): void;
  /** how far the side list (left) and the place panel (right) cover the map, in pixels */
  covered(): { left: number; right: number };
}

/** Bounds of a geometry's coordinates: [west, south, east, north]. */
function extend(box: [number, number, number, number], coords: unknown): void {
  if (typeof (coords as number[])[0] === "number") {
    const [x, y] = coords as number[];
    box[0] = Math.min(box[0], x); box[1] = Math.min(box[1], y); box[2] = Math.max(box[2], x); box[3] = Math.max(box[3], y);
  } else for (const c of coords as unknown[]) extend(box, c);
}

const BAILIWICK = "bailliage-allemagne";
const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

function placePoints(data: Dataset): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const p of data.places.values()) {
    if (p.kind !== "settlement" || p.lat === undefined || p.lon === undefined) continue;
    features.push({
      type: "Feature",
      id: p.id,
      properties: { id: p.id, icon: iconName(p.type), approx: !!p.approx },
      geometry: { type: "Point", coordinates: [p.lon, p.lat] },
    });
  }
  return { type: "FeatureCollection", features };
}

/** 45 degree hairline hatch, ink on transparent (the texture channel for shared rights). */
function hatch(size = 8): { width: number; height: number; data: Uint8Array } {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if ((x + y) % size === 0) data.set([11, 11, 11, 170], (y * size + x) * 4);
    }
  }
  return { width: size, height: size, data };
}

export class MapView {
  readonly map: MapLibre;
  private ready: Promise<void>;
  private styled = new Set<string>();
  private lastSelected?: string;
  /** a place to zoom in on when it is next selected (zoomTo), instead of only panning to it */
  private zoomNext?: string;
  /** a territory to fit the map to when it is next selected (fitTerritory) */
  private fitNext?: string;
  private cellsById = new Map<string, GeoJSON.Feature>();
  private labels: Marker[] = [];
  private territoriesShown = false;

  constructor(container: HTMLElement, private data: Dataset, private callbacks: MapCallbacks) {
    for (const f of data.cells.features) this.cellsById.set(String(f.properties?.id), f);
    this.map = new MapLibre({
      container,
      center: MAP_CENTER,
      zoom: MAP_ZOOM,
      minZoom: 6,
      maxZoom: 13,
      attributionControl: { compact: true },
      // OpenFreeMap's grey "positron" vector style (no key; OpenStreetMap data). The historical
      // layers carry the colour; the base map only gives water, relief, towns and main roads.
      style: BASEMAP_STYLE,
    });
    this.ready = new Promise((resolve) => this.map.on("load", () => {
      this.trimBasemap();
      this.addLayers();
      resolve();
    }));
    // The container changes size when the phone layout opens the panel below the map.
    new ResizeObserver(() => this.map.resize()).observe(container);

    const hover = (e: MapMouseEvent & { features?: MapGeoJSONFeature[] }) => {
      const id = e.features?.[0]?.properties?.id as string | undefined;
      this.map.getCanvas().style.cursor = id ? "pointer" : "";
      callbacks.onHover(id, e.point);
    };
    this.map.on("mousemove", "cells-fill", hover);
    this.map.on("mousemove", "places-circle", hover);
    this.map.on("mouseleave", "cells-fill", (e) => callbacks.onHover(undefined, e.point));
    this.map.on("mousemove", "terr-fill", (e) => {
      const id = this.smallestTerritory(e.features ?? []);
      this.map.getCanvas().style.cursor = id ? "pointer" : "";
      callbacks.onHover(id, e.point);
    });
    this.map.on("mouseleave", "terr-fill", (e) => callbacks.onHover(undefined, e.point));
    this.map.on("click", (e) => {
      if (this.territoriesShown) {
        callbacks.onSelect(this.smallestTerritory(this.map.queryRenderedFeatures(e.point, { layers: ["terr-fill"] })));
        return;
      }
      const hit = this.map.queryRenderedFeatures(e.point, { layers: ["places-circle", "cells-fill"] })[0];
      callbacks.onSelect(hit?.properties?.id as string | undefined);
    });
  }

  /** Drop the base map's detail that would crowd a 17th-century map: buildings, airports, minor
   *  roads and paths, road names and shields, villages' modern names (the atlas draws its own). */
  private trimBasemap(): void {
    for (const layer of this.map.getStyle().layers ?? []) {
      if (BASEMAP_DROP.test(layer.id)) this.map.removeLayer(layer.id);
    }
  }

  private addLayers(): void {
    const m = this.map;
    m.addImage("hatch", hatch());
    for (const type of Object.keys(SHAPES)) {
      m.addImage(iconName(type), shapeImage(type), { sdf: true, pixelRatio: ICON_PIXEL_RATIO });
    }
    m.addSource("cells", { type: "geojson", data: this.data.cells, promoteId: "id" });
    m.addSource("shared-cells", { type: "geojson", data: EMPTY });
    m.addSource("pledged-cells", { type: "geojson", data: EMPTY });
    m.addSource("territories", { type: "geojson", data: this.data.territories });
    m.addSource("places", { type: "geojson", data: placePoints(this.data), promoteId: "id" });

    const state = (key: string) => ["feature-state", key] as ["feature-state", string];
    m.addLayer({
      id: "cells-fill", type: "fill", source: "cells",
      paint: {
        "fill-color": ["coalesce", state("fill"), "rgba(0,0,0,0)"],
        "fill-opacity": ["case", ["boolean", state("inherited"), false], 0.4, 0.75],
      },
    });
    m.addLayer({ id: "cells-shared", type: "fill", source: "shared-cells", paint: { "fill-pattern": "hatch" } });
    m.addLayer({ id: "cells-line", type: "line", source: "cells",
      paint: { "line-color": "#fcfcfb", "line-width": 0.6 } });
    m.addLayer({ id: "cells-pledged", type: "line", source: "pledged-cells",
      paint: { "line-color": "#0b0b0b", "line-width": 1.2, "line-dasharray": [2, 2] } });
    m.addLayer({
      id: "cells-contested", type: "line", source: "cells",
      paint: { "line-color": CONTESTED, "line-width": 1.6,
        "line-opacity": ["case", ["boolean", state("contested"), false], 1, 0] },
    });
    // Territories view: realms coloured by kind, white borders between neighbours.
    const hidden: FilterSpecification = ["==", ["get", "id"], ""];
    m.addLayer({ id: "terr-fill", type: "fill", source: "territories", filter: hidden,
      paint: {
        "fill-color": ["match", ["get", "place_type"], typesIn("office"), SERIES[0], typesIn("lordship"), SERIES[1],
          typesIn("county"), SERIES[2], typesIn("marquisate"), MARQUISATE, typesIn("principality"), PRINCIPALITY,
          REALM_OTHER],
        // The neutral grey has no hue to stand out on the grey basemap: only darkness can.
        "fill-opacity": ["match", ["get", "place_type"], [...typesIn("office"), ...typesIn("lordship"), ...typesIn("county"),
          ...typesIn("marquisate"), ...typesIn("principality")], 0.45, 0.75],
      } });
    m.addLayer({ id: "terr-line", type: "line", source: "territories", filter: hidden,
      paint: { "line-color": "#fcfcfb", "line-width": 2 } });
    // A realm whose membership of the bailiwick was contested: a red border inside the white one.
    m.addLayer({ id: "terr-contested", type: "line", source: "territories", filter: hidden,
      paint: { "line-color": CONTESTED, "line-width": 2, "line-offset": 1.5 } });
    m.addLayer({ id: "terr-selected", type: "line", source: "territories", filter: hidden,
      paint: { "line-color": "#0b0b0b", "line-width": 3 } });
    m.addLayer({ id: "bailiwick", type: "line", source: "territories",
      filter: ["==", ["get", "id"], BAILIWICK],
      paint: { "line-color": "#0b0b0b", "line-width": 1.8 } });
    // Settlements: the shape says what kind of place (map/icons.ts), the fill who holds the right.
    m.addLayer({
      id: "places-circle", type: "symbol", source: "places",
      layout: {
        "icon-image": ["get", "icon"],
        "icon-size": ["interpolate", ["linear"], ["zoom"], 7, 0.35, 11, 0.8, 13, 1],
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
      },
      paint: {
        // placed at their commune: hollow (outline only), so the approximation stays visible
        "icon-color": ["case", ["get", "approx"], "rgba(255,255,255,0)", ["coalesce", state("fill"), "#ffffff"]],
        "icon-halo-color": ["case", ["boolean", state("contested"), false], CONTESTED, "#52514e"],
        "icon-halo-width": ["case", ["boolean", state("contested"), false], 1.6, 0.9],
      },
    });
    m.addLayer({ id: "selected", type: "circle", source: "places", filter: ["==", ["get", "id"], ""],
      paint: { "circle-radius": 10, "circle-color": "rgba(0,0,0,0)", "circle-stroke-color": "#0b0b0b",
        "circle-stroke-width": 2 } });
  }

  /** Among overlapping realms under the cursor, the smallest (the most specific). */
  private smallestTerritory(features: MapGeoJSONFeature[]): string | undefined {
    return [...features].sort((a, b) => (a.properties?.settlements ?? 0) - (b.properties?.settlements ?? 0))[0]
      ?.properties?.id as string | undefined;
  }

  /** Show the given realms for `year` (null hides the territories layers), labelled on the map; the
   *  `contested` ones (membership of the bailiwick contested) get a red border. */
  async showTerritories(year: number, ids: string[] | null, names: Map<string, string>, selected?: string,
    contested: string[] = []): Promise<void> {
    await this.ready;
    const m = this.map;
    this.territoriesShown = ids !== null;
    const inYear: FilterSpecification = ["all", ["<=", ["get", "from_year"], year], [">=", ["get", "to_year"], year]];
    const shown: FilterSpecification = ids
      ? ["all", inYear, ["in", ["get", "id"], ["literal", ids]]] : ["==", ["get", "id"], ""];
    m.setFilter("terr-fill", shown);
    m.setFilter("terr-line", shown);
    m.setFilter("terr-contested", ids ? ["all", inYear, ["in", ["get", "id"], ["literal", contested]]] : ["==", ["get", "id"], ""]);
    m.setFilter("terr-selected", ["all", inYear, ["==", ["get", "id"], ids && selected ? selected : ""]]);
    for (const label of this.labels) label.remove();
    this.labels = [];
    for (const id of ids ?? []) {
      const p = this.data.places.get(id);
      if (p?.lat === undefined || p.lon === undefined) continue;
      const el = document.createElement("div");
      el.className = "terr-label";
      el.textContent = names.get(id) ?? id;
      this.labels.push(new Marker({ element: el }).setLngLat([p.lon, p.lat]).addTo(m));
    }
  }

  /** Zoom in on a place when it is next selected: a place picked from a list (the table) rather than
   *  on the map, where the reader has not found it yet. */
  zoomTo(placeId: string): void {
    this.zoomNext = placeId;
  }

  /** Fit the map to a territory when it is next selected: a realm picked from a list or a panel. */
  fitTerritory(placeId: string): void {
    this.fitNext = placeId;
  }

  /** The territory's area in `year` between the side list and the panel; a realm without an area
   *  (none of its places located) is centred on its own point. */
  private fit(placeId: string, year: number): void {
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const box: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const f of this.data.territories.features) {
      const pr = f.properties ?? {};
      if (pr.id === placeId && pr.from_year <= year && year <= pr.to_year && "coordinates" in f.geometry) {
        extend(box, f.geometry.coordinates);
      }
    }
    if (box[0] === Infinity) {
      const p = this.data.places.get(placeId);
      if (p?.lat !== undefined && p.lon !== undefined) {
        this.map.easeTo({ center: [p.lon, p.lat], zoom: TERRITORY_ZOOM, duration: still ? 0 : 600 });
      }
      return;
    }
    let { left, right } = this.callbacks.covered();
    if (this.map.getContainer().clientWidth - left - right < 240) left = right = 0; // a phone: the boxes cover the map
    this.map.fitBounds(box, { padding: { top: 40, bottom: 40, left: left + 40, right: right + 40 },
      maxZoom: PLACE_ZOOM, duration: still ? 0 : 600 });
  }

  /** Pan to a newly selected place when it is outside the view, zoom in on it (zoomTo) or fit the
   *  map to it (fitTerritory). */
  private reveal(placeId: string, year: number): void {
    if (this.fitNext === placeId) {
      this.fitNext = undefined;
      return this.fit(placeId, year);
    }
    const p = this.data.places.get(placeId);
    const zoom = this.zoomNext === placeId;
    this.zoomNext = undefined;
    if (p?.lat === undefined || p.lon === undefined) return;
    if (!zoom && this.map.getBounds().contains([p.lon, p.lat])) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.map.easeTo({ center: [p.lon, p.lat], duration: still ? 0 : 600,
      ...(zoom ? { zoom: Math.max(this.map.getZoom(), PLACE_ZOOM) } : {}) });
  }

  async render(year: number, styles: Map<string, PlaceStyle>, selected?: string): Promise<void> {
    await this.ready;
    const m = this.map;
    m.setFilter("bailiwick", ["all", ["==", ["get", "id"], BAILIWICK],
      ["<=", ["get", "from_year"], year], [">=", ["get", "to_year"], year]]);
    m.setFilter("selected", ["==", ["get", "id"], selected ?? ""]);
    if (selected && (selected !== this.lastSelected || selected === this.zoomNext || selected === this.fitNext)) {
      this.reveal(selected, year);
    }
    this.lastSelected = selected;

    const blank = { fill: null, inherited: false, contested: false };
    const shared: GeoJSON.Feature[] = [];
    const pledged: GeoJSON.Feature[] = [];
    for (const [id, s] of styles) {
      const st = { fill: s.fill ?? null, inherited: !!s.inherited, contested: !!s.contested };
      m.setFeatureState({ source: "cells", id }, st);
      m.setFeatureState({ source: "places", id }, st);
      const cell = this.cellsById.get(id);
      if (cell && s.shared) shared.push(cell);
      if (cell && s.pledged) pledged.push(cell);
    }
    for (const id of this.styled) {
      if (!styles.has(id)) {
        m.setFeatureState({ source: "cells", id }, blank);
        m.setFeatureState({ source: "places", id }, blank);
      }
    }
    this.styled = new Set(styles.keys());
    (m.getSource("shared-cells") as GeoJSONSource).setData({ type: "FeatureCollection", features: shared });
    (m.getSource("pledged-cells") as GeoJSONSource).setData({ type: "FeatureCollection", features: pledged });
  }
}
