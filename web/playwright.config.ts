// End-to-end tests against the running dev server (`make e2e` starts it and runs these in
// the Playwright container; see docker-compose.yml, service "e2e").
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  workers: 3,
  reporter: [["list"]],
  outputDir: "shots/e2e-results",
  use: {
    baseURL: process.env.APP_URL ?? "http://localhost:5173",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 860 } } },
    { name: "phone", use: { ...devices["Pixel 7"] }, testMatch: /layout\.spec\.ts/ },
  ],
});
