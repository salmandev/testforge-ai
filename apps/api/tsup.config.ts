import { defineConfig } from "tsup";

/**
 * tsup config for @testforge/api
 * Fastify REST + GraphQL + WebSocket API server — ESM-only
 */
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: false,
  treeshake: true,
  target: "es2022",
  outDir: "dist",
});
