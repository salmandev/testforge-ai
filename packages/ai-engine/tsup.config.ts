import { defineConfig } from "tsup";

/**
 * tsup config for @testforge/ai-engine
 * ESM-only output with declaration files
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
