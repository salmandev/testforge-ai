import { defineConfig } from "tsup";

/**
 * tsup config for @testforge/core
 * Core outputs both ESM and CJS for maximum compatibility
 */
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: false,
  treeshake: true,
  target: "es2022",
  outDir: "dist",
});
