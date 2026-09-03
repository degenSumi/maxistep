import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const require = createRequire(import.meta.url);

/** Built by @repo/widget, which Turbo runs first because web depends on it. */
function widgetPath(): string {
  const pkg = require.resolve("@repo/widget/package.json");
  return path.join(path.dirname(pkg), "dist", "widget.js");
}

/**
 * The loader is a separate IIFE bundle, not part of the app's module graph, so
 * Vite neither compiles nor fingerprints it — it only has to be reachable at
 * /widget.js. Served from the package in dev and copied at build, so the file
 * on disk can never drift from the package source.
 */
function widgetLoader(): Plugin {
  return {
    name: "maxistep-widget-loader",

    configureServer(server) {
      server.middlewares.use("/widget.js", (_req, res) => {
        res.setHeader("Content-Type", "application/javascript");
        res.end(readFileSync(widgetPath()));
      });
    },

    buildStart() {
      mkdirSync("public", { recursive: true });
      copyFileSync(widgetPath(), path.join("public", "widget.js"));
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), widgetLoader()],
  server: {
    port: 5173,
  },
});
