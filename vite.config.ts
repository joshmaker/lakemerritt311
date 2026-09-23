import { readFileSync } from "node:fs";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type Plugin } from "vite";

/** Downloaded by `npm run fetch-data`; the app fetches it at this same relative path (see main.ts). */
const DATA_FILE = "data/api/311.json";

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
  server: {
    open: true,
    // data/ can be very large; don't watch it for reloads.
    watch: { ignored: ["**/data/**"] },
  },
});
