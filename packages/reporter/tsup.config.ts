import { defineConfig } from "tsup";

/**
 * tsup config for @testforge/reporter
 * Allure, AI narrative, PDF, and notification reporters — ESM-only
 */
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: true,
  treeshake: true,
  target: "es2022",
  outDir: "dist",
});
