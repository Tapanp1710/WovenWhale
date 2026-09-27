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
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, grepInvert: /@mobile/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, grep: /@mobile/ },
  ],
  webServer: [
    { command: "npm run dev -w backend", cwd: "..", url: "http://localhost:4000/api/health", reuseExistingServer: true, timeout: 120_000 },
    { command: "npm run dev -w frontend", cwd: "..", url: "http://localhost:3000", reuseExistingServer: true, timeout: 180_000 },
  ],
});
