import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@ai-tutor/shared": path.resolve(__dirname, "../../shared/src/index.ts"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Proxy /api and /ws to the wrangler dev server during local development
      "/api": {
        target: "http://localhost:8787",
        changeOrigin: true,
      },
      "/ws": {
        target: "http://localhost:8787",
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
