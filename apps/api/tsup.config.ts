import { defineConfig } from "tsup";

// Emits apps/api/api/index.js. Anything under `api/` is turned into a
// serverless function by Vercel's Node builder, so the deployed function runs
// pre-built JS and the platform never compiles our TypeScript with its own tsc
// version (which is older, and reports false errors against ai@7 and zod@4).
export default defineConfig({
  entry: { index: "src/index.ts" },
  outDir: "api",
  format: ["esm"],
  target: "node22",
  platform: "node",
  // Workspace packages ship TypeScript source, so they must be inlined.
  noExternal: [/^@repo\//],
  splitting: false,
  clean: false,
  dts: false,
  sourcemap: false,
});
