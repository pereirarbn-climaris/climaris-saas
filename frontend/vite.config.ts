import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const API_TARGET = "http://127.0.0.1:8000";

/** API versionada + health (fora de /api/v1). */
const API_PREFIXES = ["/api/v1", "/health"] as const;

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: Object.fromEntries(
      API_PREFIXES.map((prefix) => [prefix, { target: API_TARGET, changeOrigin: true }])
    ),
  },
});
