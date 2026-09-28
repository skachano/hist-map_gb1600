// The map: settlement cells and points styled per place by the active view, overlays
// for shared (hatched) and pledged (dashed) rights, and the bailiwick outline for the year.
import {
  type GeoJSONSource, Map as MapLibre, type MapGeoJSONFeature, type MapMouseEvent, setWorkerUrl,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
// MapLibre looks for its worker next to its own module, which bundling moves; hand it
// Vite's bundled copy instead (same in dev and in the production build).
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { MAP_CENTER, MAP_ZOOM } from "../config";
import type { Dataset } from "../data/types";
import { CONTESTED } from "../model/colors";

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
      properties: { id: p.id, town: p.type === "town" || p.type === "small_town", approx: !!p.approx },
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
  private cellsById = new Map<string, GeoJSON.Feature>();

  constructor(container: HTMLElement, private data: Dataset, callbacks: MapCallbacks) {
    for (const f of data.cells.features) this.cellsById.set(String(f.properties?.id), f);
    this.map = new MapLibre({
      container,
      center: MAP_CENTER,
      zoom: MAP_ZOOM,
      minZoom: 6,
      maxZoom: 13,
      attributionControl: { compact: true },
      style: {
        version: 8,
        sources: {
          osm: {
            type: "raster",
            tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
            tileSize: 256,
            attribution: "© OpenStreetMap contributors",
          },
        },
        // A faded, grey base map: the historical layers carry the colour.
        layers: [{ id: "osm", type: "raster", source: "osm",
          paint: { "raster-saturation": -1, "raster-opacity": 0.45, "raster-contrast": -0.2 } }],
      },
    });
    this.ready = new Promise((resolve) => this.map.on("load", () => { this.addLayers(); resolve(); }));
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
    this.map.on("click", (e) => {
      const hit = this.map.queryRenderedFeatures(e.point, { layers: ["places-circle", "cells-fill"] })[0];
      callbacks.onSelect(hit?.properties?.id as string | undefined);
    });
  }

  private addLayers(): void {
    const m = this.map;
    m.addImage("hatch", hatch());
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
    m.addLayer({ id: "bailiwick", type: "line", source: "territories",
      filter: ["==", ["get", "id"], BAILIWICK],
      paint: { "line-color": "#0b0b0b", "line-width": 1.8 } });
    m.addLayer({
      id: "places-circle", type: "circle", source: "places",
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 7, ["case", ["get", "town"], 4, 2], 11,
          ["case", ["get", "town"], 8, 5]],
        "circle-color": ["coalesce", state("fill"), "#ffffff"],
        // placed at their commune: hollow, so the approximation stays visible
        "circle-opacity": ["case", ["get", "approx"], 0, 1],
        "circle-stroke-color": ["case", ["boolean", state("contested"), false], CONTESTED, "#52514e"],
        "circle-stroke-width": ["case", ["boolean", state("contested"), false], 1.6, 0.8],
      },
    });
    m.addLayer({ id: "selected", type: "circle", source: "places", filter: ["==", ["get", "id"], ""],
      paint: { "circle-radius": 10, "circle-color": "rgba(0,0,0,0)", "circle-stroke-color": "#0b0b0b",
        "circle-stroke-width": 2 } });
  }

  /** Pan to a newly selected place when it is outside the view. */
  private reveal(placeId: string): void {
    const p = this.data.places.get(placeId);
    if (p?.lat === undefined || p.lon === undefined) return;
    if (this.map.getBounds().contains([p.lon, p.lat])) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.map.easeTo({ center: [p.lon, p.lat], duration: still ? 0 : 600 });
  }

  async render(year: number, styles: Map<string, PlaceStyle>, selected?: string): Promise<void> {
    await this.ready;
    const m = this.map;
    m.setFilter("bailiwick", ["all", ["==", ["get", "id"], BAILIWICK],
      ["<=", ["get", "from_year"], year], [">=", ["get", "to_year"], year]]);
    m.setFilter("selected", ["==", ["get", "id"], selected ?? ""]);
    if (selected && selected !== this.lastSelected) this.reveal(selected);
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
