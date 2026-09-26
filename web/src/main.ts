import { Map } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./style.css";
import { MAP_CENTER, MAP_ZOOM } from "./config";

// Stage 0: blank base map. Data layers arrive in Stage 8.
new Map({
  container: "map",
  center: MAP_CENTER,
  zoom: MAP_ZOOM,
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
    layers: [{ id: "osm", type: "raster", source: "osm" }],
  },
});
