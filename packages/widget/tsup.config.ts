import { defineConfig } from "tsup";

export default defineConfig({
  entry: { widget: "src/index.ts" },
  // A host page drops this in a plain <script> tag, so it cannot be an ES module
  // and cannot assume a bundler.
  format: ["iife"],
  target: "es2018",
  minify: true,
  clean: false,
  // @repo/shared ships raw TypeScript; it has to be compiled in, not required.
  noExternal: [/^@repo\//],
  // Stays inside the package so Turbo can cache it; the web build copies it in.
  outDir: "dist",
  // tsup suffixes IIFE builds ".global" by default; the public URL is /widget.js.
  outExtension: () => ({ js: ".js" }),
});
