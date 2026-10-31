import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Static build of the public demo: sample data in the browser, no server and
// no cloud sync. Relative asset paths so it works from any folder (GitHub Pages).
export default defineConfig({
  root: fileURLToPath(new URL("./demo", import.meta.url)),
  publicDir: fileURLToPath(new URL("./public", import.meta.url)),
  base: "./",
  plugins: [react()],
  define: {
    "import.meta.env.VITE_WORKLEDGER_DEMO": JSON.stringify("true"),
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    outDir: fileURLToPath(new URL("./dist-demo", import.meta.url)),
    emptyOutDir: true,
  },
  server: { port: 5180 },
});
