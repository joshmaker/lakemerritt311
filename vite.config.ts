import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tailwindcss()],
  server: {
    open: true,
    // data/ can be very large; don't watch it for reloads.
    watch: { ignored: ["**/data/**"] },
  },
});
