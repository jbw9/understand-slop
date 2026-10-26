import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  use: { baseURL: "http://localhost:3001" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  // The demo frames the live app, so both run: the app, and this page proxying to it.
  webServer: [
    { command: "npm run dev", cwd: "../app", url: "http://localhost:3000", reuseExistingServer: !process.env.CI, timeout: 120_000 },
    { command: "npm run dev", url: "http://localhost:3001", reuseExistingServer: !process.env.CI, timeout: 120_000 },
  ],
});
