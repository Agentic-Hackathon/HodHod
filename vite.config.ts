import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";
const offlineManifest: Plugin = {
  name: "offline-manifest",
  generateBundle(_options, bundle) {
    this.emitFile({
      type: "asset",
      fileName: "sw-assets.json",
      source: JSON.stringify(Object.keys(bundle)),
    });
  },
};
export default defineConfig({
  plugins: [react(), offlineManifest],
  server: { port: 5173, proxy: {
    "/api/brain": { target: `http://127.0.0.1:${process.env.HODHOD_BRAIN_PORT||8790}`, rewrite: path => path.replace(/^\/api\/brain/, '/api/workspace') },
    "/api": `http://127.0.0.1:${process.env.TOROB_API_PORT||8787}`
  } },
  build: { chunkSizeWarningLimit: 1500 },
});
