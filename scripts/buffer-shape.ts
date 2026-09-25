// Pads the Lake Merritt outline outward by PAD_METERS and saves it for the map (src/map.ts).
// The original outline stays as-is; scripts/fetch.sh selects requests with it.
// Run with: npm run buffer-shape
import { readFileSync, writeFileSync } from "node:fs";
import buffer from "@turf/buffer";
import type { FeatureCollection, Polygon } from "geojson";

const PAD_METERS = 60;
const SOURCE = "data/shapes/geojson.json";
const TARGET = "data/shapes/geojson-padded.json";

const outline = JSON.parse(readFileSync(SOURCE, "utf8")) as FeatureCollection<Polygon>;
const padded = buffer(outline, PAD_METERS, { units: "meters" });
const geometries = padded?.features.map(({ geometry }) => geometry.type) ?? [];
// src/map.ts expects one Polygon; a big enough pad could merge or split shapes.
if (geometries.length !== 1 || geometries[0] !== "Polygon") {
  throw new Error(`Expected one Polygon after padding, got: ${geometries.join(", ") || "nothing"}`);
}
writeFileSync(TARGET, `${JSON.stringify(padded)}\n`);
console.log(`Wrote ${TARGET}: ${SOURCE} padded by ${String(PAD_METERS)} m.`);
