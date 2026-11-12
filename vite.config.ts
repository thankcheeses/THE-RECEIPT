import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";

/**
 * Static build profile (VITE_STATIC_DEMO=true), used for the GitHub Pages
 * deployment.
 */
const isStaticBuild = process.env.VITE_STATIC_DEMO === "true";

/**
 * Removes the analytics tag from index.html when it cannot work: always in the
 * static build, and in any other build where `VITE_ANALYTICS_ENDPOINT` or
 * `VITE_ANALYTICS_WEBSITE_ID` is unset. Left in place, its `%VITE_ANALYTICS_*%`
 * placeholders would ship as a literal, unresolvable script src.
 */
function vitePluginStripAnalytics(): Plugin {
  let strip = isStaticBuild;
  return {
    name: "strip-analytics",
    configResolved(config) {
      strip = isStaticBuild || !config.env.VITE_ANALYTICS_ENDPOINT || !config.env.VITE_ANALYTICS_WEBSITE_ID;
    },
    transformIndexHtml: {
      // Before Vite substitutes %VITE_*% placeholders, so an unset variable is
      // removed quietly instead of warned about and shipped.
      order: "pre",
      handler(html) {
        return strip ? html.replace(/\s*<script defer src="%VITE_ANALYTICS_ENDPOINT%[^>]*><\/script>/, "") : html;
      },
    },
  };
}

const plugins = [react(), tailwindcss(), vitePluginStripAnalytics()];

export default defineConfig({
  // GitHub Pages serves the project site from /THE-RECEIPT/; the server build
  // stays at the domain root.
  base: process.env.VITE_BASE_PATH ?? "/",
  plugins,
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  publicDir: path.resolve(import.meta.dirname, "client", "public"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    host: true,
    allowedHosts: [
      "localhost",
      "127.0.0.1",
    ],
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
