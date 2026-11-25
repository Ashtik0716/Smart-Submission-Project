import { defineConfig } from "vite";

export default defineConfig({
  base: "./", // relative asset paths, which suits an extension
  build: {
    outDir: "dist",
    emptyOutDir: true,          // wipe dist/ on every build so stale files can't linger
    minify: false,              // readable output while we're learning and debugging
    modulePreload: { polyfill: false }, // not needed in Chrome, and keeps output simple
    rollupOptions: {
      // Two entry points: the side panel page and the background worker
      input: {
        sidepanel: "src/sidepanel.html",
        "service-worker": "src/service-worker.js",
      },
      output: {
        // The manifest names the worker file, so it must NOT get a hashed name
        entryFileNames: (chunk) =>
          chunk.name === "service-worker"
            ? "src/service-worker.js"
            : "assets/[name]-[hash].js",
      },
    },
  },
});
