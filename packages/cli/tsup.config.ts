import { defineConfig } from "tsup";

/**
 * tsup config for @testforge/cli
 * Two entry points: CLI binary + library index
 */
export default defineConfig({
  entry: ["src/cli.ts", "src/index.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: false,
  treeshake: true,
  target: "es2022",
  outDir: "dist",
});
