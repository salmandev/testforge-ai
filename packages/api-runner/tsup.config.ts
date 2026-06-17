import { defineConfig } from "tsup";

/**
 * tsup config for @testforge/api-runner
 * REST, GraphQL, gRPC, WebSocket API test runner — ESM-only
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
