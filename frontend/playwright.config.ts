import { defineConfig, devices } from "@playwright/test";

try {
  process.loadEnvFile("../.env");
} catch {
  // CI provides variables directly.
}

/**
 * End-to-end suite. Requires the local stack (Postgres, API on :4000, storefront
 * on :3000) with the development OTP code and mock payment gateway enabled.
 * Existing dev servers are reused; otherwise Playwright starts them.
 * If those ports are taken by something else, pick others:
 *   E2E_WEB_PORT=3100 E2E_API_PORT=4100 npm run test:e2e
 */
const WEB_PORT = process.env.E2E_WEB_PORT ?? "3000";
const API_PORT = process.env.E2E_API_PORT ?? "4000";
const WEB = `http://localhost:${WEB_PORT}`;
const API = `http://localhost:${API_PORT}`;
process.env.E2E_BASE_URL ??= WEB; // read by e2e/support/fixtures.ts
export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.E2E_BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, grepInvert: /@mobile/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, grep: /@mobile/ },
  ],
  webServer: [
    {
      // No watch mode: tsx watch stays silent when started without a terminal.
      command: "npx tsx --env-file-if-exists=../.env src/server.ts",
      cwd: "../backend",
      url: `${API}/api/health`,
      reuseExistingServer: true,
      timeout: 120_000,
      env: { BACKEND_PORT: API_PORT, SITE_URL: WEB, ALLOWED_ORIGINS: WEB },
    },
    {
      command: `npx next dev --port ${WEB_PORT}`,
      url: WEB,
      reuseExistingServer: true,
      timeout: 180_000,
      env: { BACKEND_URL: API, SITE_URL: WEB },
    },
  ],
});
