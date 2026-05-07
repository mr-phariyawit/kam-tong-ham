import { defineConfig } from "@playwright/test";

/**
 * Playwright config for kam-tong-ham E2E browser tests.
 *
 * Chromium-only to keep CI fast. Tests run against a local Colyseus
 * server spun up via globalSetup/globalTeardown.
 */
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/fixtures/server.ts",
  globalTeardown: "./e2e/fixtures/server-teardown.ts",
  fullyParallel: false, // sequential — tests share a single server
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1, // one worker — multi-tab tests coordinate timing
  reporter: process.env.CI ? "github" : "list",
  timeout: 60_000, // 60s per test — generous for multi-player coordination

  use: {
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: {
        browserName: "chromium",
        // Real Chromium, not jsdom, not mock anything
        headless: !process.env.E2E_HEADED,
      },
    },
  ],
});
