import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
  { ignores: ["dist/", "data/", "node_modules/"] },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },
  // Config files and Node scripts live outside the browser tsconfig; tsc type-checks them
  // via tsconfig.node.json instead.
  { files: ["*.config.ts", "scripts/**/*.ts"], extends: [tseslint.configs.disableTypeChecked] },
);
