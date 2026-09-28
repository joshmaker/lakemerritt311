import { readFileSync, statSync } from "node:fs";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

/** Downloaded by `npm run fetch-data`; main.ts imports its URL, so builds include it. */
const DATA_FILE = "data/api/311.json";

/** The dataset's metadata, also downloaded by `npm run fetch-data`. */
const META_FILE = "data/api/311-meta.json";

/**
 * When the city last uploaded new data, as an ISO timestamp: the metadata's `rowsUpdatedAt`
 * (Unix seconds). Falls back to when the data was downloaded (the data file's modified time), then
 * to "". Read once, when the build or dev server starts.
 */
const dataUpdatedAt = (): string => {
  try {
    const { rowsUpdatedAt } = JSON.parse(readFileSync(META_FILE, "utf8")) as { rowsUpdatedAt?: unknown };
    if (typeof rowsUpdatedAt === "number") return new Date(rowsUpdatedAt * 1000).toISOString();
  } catch {
    // Not downloaded yet; fall through.
  }
  try {
    return statSync(DATA_FILE).mtime.toISOString();
  } catch {
    return "";
  }
};

export default defineConfig({
  // Relative asset URLs, so the build works from any path, e.g. GitHub Pages' /<repo>/.
  base: "./",
  plugins: [tailwindcss()],
  // Declared in src/types/globals.d.ts.
  define: { __DATA_UPDATED_AT__: JSON.stringify(dataUpdatedAt()) },
  server: {
    open: true,
    // data/ can be very large; don't watch it for reloads.
    watch: { ignored: ["**/data/**"] },
  },
});
