import { readFileSync, statSync } from "node:fs";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type Plugin } from "vite";

/** Downloaded by `npm run fetch-data`; the app fetches it at this same relative path (see main.ts). */
const DATA_FILE = "data/api/311.json";

/**
 * When the data was downloaded, as an ISO timestamp: the file's modified time, since fetch.sh
 * writes it fresh. Empty if it hasn't been downloaded. Read once, when the build or dev server starts.
 */
const dataFetchedAt = (): string => {
  try {
    return statSync(DATA_FILE).mtime.toISOString();
  } catch {
    return "";
  }
};

/** Copies the downloaded data into the build, so `dist/` is a complete static site. */
const includeData = (): Plugin => ({
  name: "include-data",
  apply: "build",
  generateBundle() {
    let source: Buffer;
    try {
      source = readFileSync(DATA_FILE);
    } catch {
      this.error(`${DATA_FILE} is missing. Run "npm run fetch-data" before building.`);
    }
    this.emitFile({ type: "asset", fileName: DATA_FILE, source });
  },
});

export default defineConfig({
  // Relative asset URLs, so the build works from any path, e.g. GitHub Pages' /<repo>/.
  base: "./",
  plugins: [tailwindcss(), includeData()],
  // Declared in src/types/globals.d.ts.
  define: { __DATA_FETCHED_AT__: JSON.stringify(dataFetchedAt()) },
  server: {
    open: true,
    // data/ can be very large; don't watch it for reloads.
    watch: { ignored: ["**/data/**"] },
  },
});
