/**
 * Smoke test: verify that the test fixtures work correctly.
 *
 * - Server is running and responds to /api/health
 * - /api/games returns 6 games
 * - A browser page can load the home page
 */
import { test, expect } from "@playwright/test";
import { getBaseURL } from "./fixtures/multi-page";

test.describe("Fixture smoke tests", () => {
  test("server responds to /api/health", async ({ request }) => {
    const baseURL = getBaseURL();
    const response = await request.get(`${baseURL}/api/health`);
    expect(response.ok()).toBe(true);

    const body = await response.json();
    expect(body.status).toBe("ok");
  });

  test("/api/games returns 6 games", async ({ request }) => {
    const baseURL = getBaseURL();
    const response = await request.get(`${baseURL}/api/games`);
    expect(response.ok()).toBe(true);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.games).toHaveLength(6);
  });

  test("home page loads in a real browser", async ({ page }) => {
    const baseURL = getBaseURL();
    await page.goto(`${baseURL}/`);

    // The main page should have game cards
    await expect(page.locator("body")).toBeVisible();

    // Check that some content loaded (the page title or game list)
    const title = await page.title();
    expect(title).toBeTruthy();
  });

  test("spy game page loads", async ({ page }) => {
    const baseURL = getBaseURL();
    await page.goto(`${baseURL}/games/spy/index.html`);

    // The home screen should be active by default
    await expect(page.locator("#screen-home")).toHaveClass(/active/);

    // Verify the Create Room button exists
    await expect(page.locator("#btnCreate")).toBeVisible();
  });

  test("werewolf game page loads", async ({ page }) => {
    const baseURL = getBaseURL();
    await page.goto(`${baseURL}/games/werewolf/index.html`);

    // The home screen should be active by default
    await expect(page.locator("#screen-home")).toHaveClass(/active/);

    // Verify the Create Room button exists
    await expect(page.locator("#btnCreate")).toBeVisible();
  });
});
