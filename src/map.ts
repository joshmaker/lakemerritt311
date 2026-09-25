import "maplibre-gl/dist/maplibre-gl.css";
import {
  type ExpressionSpecification,
  LngLat,
  LngLatBounds,
  Map as MapLibreMap,
  NavigationControl,
  type GeoJSONSource,
  type MapMouseEvent,
  setWorkerUrl,
} from "maplibre-gl";
// MapLibre finds its worker relative to its own file, which breaks once Vite bundles it.
// Importing it this way has Vite bundle the worker and hand back its URL.
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
// The outline padded outward by 60 m (regenerate with `npm run buffer-shape`).
import outline from "../data/shapes/geojson-padded.json";
import { cssVar } from "./dom";

setWorkerUrl(workerUrl);

// Free vector base map: no API key, no sign-up, no usage fees (https://openfreemap.org).
// "Liberty": colorful, with green parks and blue water.
const STYLE_URL = "https://tiles.openfreemap.org/styles/bright";

/** The Lake Merritt area: the polygon scripts/fetch.sh uses to select requests, plus padding. */
const ring = outline.features[0]?.geometry.coordinates[0] ?? [];
const bounds = ring.reduce((box, [lng = 0, lat = 0]) => box.extend([lng, lat]), new LngLatBounds());

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/** The nearest point to `center` inside the area's bounds, so the lake can't be dragged out of view. */
const centerInArea = (center: LngLat) =>
  new LngLat(clamp(center.lng, bounds.getWest(), bounds.getEast()), clamp(center.lat, bounds.getSouth(), bounds.getNorth()));

/** How many zoom levels people can zoom out past the view that fits the whole area. */
const ZOOM_OUT_LEVELS = 1;
/**
 * Deepest zoom: street level, about 100 m across. Bubbles are grouped all the way down to it,
 * and past it they'd drift visibly off their spot: MapLibre stores bubble positions at reduced
 * precision, and the error doubles with each zoom level (a few pixels here, ~25 at MapLibre's max of 22).
 */
const MAX_ZOOM = 19;

/**
 * Width of the soft edge, in meters on the ground. The blurred line is centered on the
 * boundary, so the fade reaches about half of this into the area.
 */
const FADE_METERS = 100;
/** Line width in pixels at zoom 0 for FADE_METERS here (512px tiles, at this latitude). */
const FADE_PX_AT_Z0 = FADE_METERS / ((40_075_016 * Math.cos((bounds.getCenter().lat * Math.PI) / 180)) / 512);

/** The whole world with the outline cut out, for hiding everything outside the area. */
const WORLD = [[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]];

/** A dot on the map. Nearby dots merge into numbered bubbles until you zoom in. */
export interface MapPoint {
  lng: number;
  lat: number;
  color: string;
}

export interface MapHandle {
  /** Replaces the dots on the map. Safe to call before the map has finished loading. */
  showPoints: (points: MapPoint[]) => void;
}

/**
 * Called when someone clicks the map, with the indices (into the latest `showPoints` list)
 * of the dots they picked: every dot in a bubble, one dot, or none for empty map.
 */
export type OnSelect = (indices: number[]) => void;

/** Bubble radius in pixels by how many requests it groups: under 10, under 50, under 150, more. */
const CLUSTER_RADIUS: ExpressionSpecification = ["step", ["get", "point_count"], 14, 10, 18, 50, 24, 150, 30];

/**
 * Draws a map of the Lake Merritt area in `container`, which must be visible (MapLibre measures
 * it on creation), and removes it when `signal` aborts. Zooming uses pinch, double-click, or
 * Ctrl/⌘+scroll, so the page still scrolls normally over the map. Returns a handle for adding dots.
 */
export const renderMap = (container: HTMLElement, onSelect: OnSelect, signal: AbortSignal): MapHandle => {
  let minZoom = 0; // set once the map has fitted the area (see below)
  const map = new MapLibreMap({
    container,
    style: STYLE_URL,
    bounds,
    fitBoundsOptions: { padding: 24 },
    maxZoom: MAX_ZOOM,
    // Replaces MapLibre's default constraint, which is also what applies its min and max zoom, so
    // this applies them too. MapLibre still needs them set, to disable its +/− buttons at the limits.
    transformConstrain: (center, zoom) => ({ center: centerInArea(center), zoom: clamp(zoom, minZoom, MAX_ZOOM) }),
    cooperativeGestures: true,
    // The style supplies the required OpenFreeMap / OpenMapTiles / OpenStreetMap credits.
    attributionControl: { compact: true },
  });
  map.addControl(new NavigationControl({ showCompass: false }), "top-right");

  // "style.load" fires once the style is parsed, well before the base map finishes loading its
  // map data ("load"), so the fade and dots appear right away.
  map.once("style.load", () => {
    // Allow a little zooming out from the fitted view, but not so far the lake becomes a speck.
    minZoom = map.getZoom() - ZOOM_OUT_LEVELS;
    map.setMinZoom(minZoom);

    // Hide everything outside the area by covering it in the card's color, then soften the
    // boundary with a wide blurred line in the same color, so the map fades into the card.
    const panel = cssVar("--color-series-others");
    map.addSource("outside", {
      type: "geojson",
      data: { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [WORLD, ring] } },
    });
    map.addLayer({ id: "outside", type: "fill", source: "outside", paint: { "fill-color": panel, "fill-opacity": 0.8 } });
    map.addSource("edge", {
      type: "geojson",
      data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: ring } },
    });
    // Width doubles with each zoom level, so the fade stays about FADE_METERS wide on the ground.
    const width: ExpressionSpecification = [
      "interpolate",
      ["exponential", 2],
      ["zoom"],
      0,
      FADE_PX_AT_Z0,
      22,
      FADE_PX_AT_Z0 * 2 ** 22,
    ];
    map.addLayer({
      id: "edge",
      type: "line",
      source: "edge",
      layout: { "line-join": "round", "line-cap": "round" },
      paint: { "line-color": panel, "line-width": width, "line-blur": width },
    });
  });
  // Resolves after the handler above, so dots are always drawn over the fade.
  const loaded = map.once("style.load");

  let points: MapPoint[] = [];
  const addPointLayers = () => {
    const ink = cssVar("--color-ink");
    // Group dots all the way to the deepest zoom, not just to MapLibre's default of 17: many
    // requests share one spot (e.g. the city puts "LAKESIDE PARK - PERGOLA" and "LAKESIDE PARK -
    // GARDEN CENTER" on the same point), and past the last grouping zoom they'd be separate dots
    // stacked exactly on top of each other, looking like one. The source must tile one zoom deeper.
    map.addSource("requests", {
      type: "geojson",
      data: pointFeatures(points),
      cluster: true,
      clusterRadius: 40,
      clusterMaxZoom: MAX_ZOOM,
      maxzoom: MAX_ZOOM + 1,
    });
    // Bubbles: groups of nearby requests, sized by count.
    map.addLayer({
      id: "clusters",
      type: "circle",
      source: "requests",
      filter: ["has", "point_count"],
      paint: {
        "circle-color": ink,
        "circle-opacity": 0.75,
        "circle-radius": CLUSTER_RADIUS,
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 1.5,
      },
    });
    map.addLayer({
      id: "cluster-counts",
      type: "symbol",
      source: "requests",
      filter: ["has", "point_count"],
      layout: { "text-field": ["get", "point_count_abbreviated"], "text-font": ["Noto Sans Bold"], "text-size": 12 },
      paint: { "text-color": "#ffffff" },
    });
    // Single requests, colored by topic.
    map.addLayer({
      id: "points",
      type: "circle",
      source: "requests",
      filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-color": ["get", "color"],
        "circle-radius": 6,
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 1.5,
      },
    });

    // Clicking picks a bubble's dots, a single dot, or nothing (empty map clears the pick).
    map.on("click", (event: MapMouseEvent) => {
      const feature = map.queryRenderedFeatures(event.point, { layers: ["clusters", "points"] })[0];
      const { cluster_id: clusterId, point_count: count, index } = feature?.properties ?? {};
      if (clusterId === undefined) {
        onSelect(index === undefined ? [] : [Number(index)]);
        return;
      }
      const picked = points;
      void map
        .getSource<GeoJSONSource>("requests")
        ?.getClusterLeaves(Number(clusterId), Number(count), 0)
        .then((leaves) => {
          // Skip if the dots were replaced (e.g. a filter changed) while the leaves loaded.
          if (picked === points) onSelect(leaves.map((leaf) => Number(leaf.properties?.index)));
        });
    });
    for (const layer of ["clusters", "points"]) {
      map.on("mouseenter", layer, () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", layer, () => (map.getCanvas().style.cursor = ""));
    }
  };

  signal.addEventListener(
    "abort",
    () => {
      map.remove();
    },
    { once: true },
  );

  return {
    showPoints: (next) => {
      points = next;
      void loaded.then(() => {
        const source = map.getSource<GeoJSONSource>("requests");
        if (source) void source.setData(pointFeatures(points));
        else addPointLayers();
      });
    },
  };
};

/** Points as GeoJSON; each feature keeps its index into `points` for `onSelect`. */
const pointFeatures = (points: MapPoint[]) => ({
  type: "FeatureCollection" as const,
  features: points.map(({ lng, lat, color }, index) => ({
    type: "Feature" as const,
    properties: { color, index },
    geometry: { type: "Point" as const, coordinates: [lng, lat] },
  })),
});
