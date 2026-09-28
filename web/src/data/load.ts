import type { Dataset, Entity, HistEvent, Meta, Place, Right } from "./types";

async function fetchJson<T>(name: string, version = ""): Promise<T> {
  const response = await fetch(`${import.meta.env.BASE_URL}data/${name}${version ? `?v=${version}` : ""}`);
  if (!response.ok) throw new Error(`could not load ${name}: ${response.status}`);
  return response.json() as Promise<T>;
}

export async function loadDataset(): Promise<Dataset> {
  const meta = await fetchJson<Meta>("meta.json");
  const v = meta.version; // cache-busts the other files whenever the data changes
  const [places, entities, rights, events, territories, cells] = await Promise.all([
    fetchJson<Place[]>("places.json", v),
    fetchJson<Entity[]>("entities.json", v),
    fetchJson<Right[]>("rights.json", v),
    fetchJson<HistEvent[]>("events.json", v),
    fetchJson<GeoJSON.FeatureCollection>("territories.geojson", v),
    fetchJson<GeoJSON.FeatureCollection>("cells.geojson", v),
  ]);
  return {
    meta,
    places: new Map(places.map((p) => [p.id, p])),
    entities: new Map(entities.map((e) => [e.id, e])),
    rights,
    events,
    territories,
    cells,
  };
}
