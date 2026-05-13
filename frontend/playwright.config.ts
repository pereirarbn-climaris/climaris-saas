import { defineConfig, devices } from "@playwright/test";

/**
 * Smoke E2E do fluxo Mercado Pago no front (rotas sob /app).
 * Rode: `cd frontend && npx playwright install chromium && npm run test:e2e`
 * Com servidor já no ar: `CI= npm run test:e2e` (reuseExistingServer).
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "line" : "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5173",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 5173",
    url: "http://127.0.0.1:5173/",
    /** Evita conflito de porta se o dev já estiver no ar (local ou job CI que sobe o Vite antes). */
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
