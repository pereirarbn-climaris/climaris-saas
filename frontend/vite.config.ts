import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const API_TARGET = "http://127.0.0.1:8000";

/** API versionada + health (fora de /api/v1). */
const API_PREFIXES = ["/api/v1", "/health"] as const;

export default defineConfig({
  plugins: [react()],
  build: {
    /** Após partição manual, 600 kB costuma ser barreira segura para o maior chunk de app. */
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const norm = id.replace(/\\/g, "/");
          if (norm.includes("node_modules")) {
            if (norm.includes("node_modules/@capacitor")) return "vendor-capacitor";
            if (norm.includes("node_modules/qrcode")) return "vendor-qrcode";
            if (norm.includes("node_modules/zod")) return "vendor-zod";
            if (norm.includes("node_modules/react-dom")) return "vendor-react-dom";
            if (norm.includes("node_modules/react-router")) return "vendor-react-router";
            if (norm.includes("node_modules/react/")) return "vendor-react";
            return "vendor";
          }
          if (norm.includes("/src/pages/finance/")) return "chunk-finance-pages";
          if (norm.includes("/src/pages/pmoc/")) return "chunk-pmoc-pages";
          if (
            norm.includes("/src/pages/service-orders/")
            || norm.includes("/src/pages/preventive/")
            || norm.includes("/src/pages/agenda/")
          ) {
            return "chunk-field-ops-pages";
          }
          if (norm.includes("/src/pages/integrations/")) return "chunk-integrations-pages";
          if (norm.includes("/src/pages/marketplace/")) return "chunk-marketplace-pages";
          if (norm.includes("/src/pages/fiscal/")) return "chunk-fiscal-pages";
          if (norm.includes("/src/pages/clients/")) return "chunk-clients-pages";
          if (norm.includes("/src/pages/budgets/")) return "chunk-budgets-pages";
          if (
            norm.includes("/src/pages/products/")
            || norm.includes("/src/pages/inventory/")
            || norm.includes("/src/pages/services/")
          ) {
            return "chunk-catalog-pages";
          }
          if (norm.includes("/src/pages/saas/") || norm.includes("/src/pages/Platform")) {
            return "chunk-platform-pages";
          }
          if (norm.includes("/src/pages/admin/") || norm.includes("/src/pages/security/")) {
            return "chunk-admin-pages";
          }
          if (norm.includes("/src/pages/public/")) return "chunk-public-pages";
          if (norm.includes("/src/pages/dashboard/")) return "chunk-dashboard-pages";
          if (norm.includes("/src/pages/")) return "chunk-app-pages";
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: Object.fromEntries(
      API_PREFIXES.map((prefix) => [prefix, { target: API_TARGET, changeOrigin: true }])
    ),
  },
});
